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
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ToastProvider } from '../../Toast'
import {
  MODULE_CONTEXTUAL_MAPPING,
  getContextualActions,
  getGroupedGlobalActions,
  getAllPermittedActions,
  getReadyContextualActions,
  getReadyPermittedActions,
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
  // SECTION 3: GlobalAddMenu — one tap to the page's own creation
  // RULING 2026-10-13: only creation flows that write through a real action are offered.
  // New Rental keeps its navigation door (RULINGS-2026-10-07), so it stays inside Add.
  // ───────────────────────────────────────────────────────────────────────────
  describe('Section 3: GlobalAddMenu', () => {
    function LocationProbe() {
      const location = useLocation()
      return <output data-testid="location">{location.pathname + location.search}</output>
    }

    async function renderMenu(props: { module?: string; onSelectAction?: (a: { id: string }) => void }, path = '/today') {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={[path]}>
            <ToastProvider>
              <CreationContextProvider>
                <GlobalAddMenu {...props} />
                <LocationProbe />
              </CreationContextProvider>
            </ToastProvider>
          </MemoryRouter>
        )
      })
    }

    const primaryButton = () => container.querySelector<HTMLButtonElement>('.global-add-menu__primary')
    const chevron = () => container.querySelector<HTMLButtonElement>('button[aria-label="More create options"]')
    const addTrigger = () => container.querySelector<HTMLButtonElement>('button[aria-label="Create new record"]')
    const location = () => container.querySelector('[data-testid="location"]')?.textContent
    const menuItemText = () =>
      Array.from(document.querySelectorAll('.global-add-menu .global-add-menu__item')).map((i) => i.textContent)

    it('names the page creation on the one-tap segment, both segments >= 44px (Law 15)', async () => {
      await renderMenu({ module: 'clients' })

      expect(primaryButton()?.textContent).toContain('New Client')
      expect(primaryButton()?.style.minHeight).toBe('44px')
      expect(chevron()?.style.minHeight).toBe('44px')
      expect(chevron()?.style.width).toBe('44px')
    })

    it('opens the real equipment form in one tap, taking the module from the route', async () => {
      await renderMenu({}, '/inventory')
      expect(primaryButton()?.textContent).toContain('New Equipment')

      await act(async () => {
        primaryButton()!.click()
      })
      expect(location()).toBe('/inventory/new')
    })

    it('keeps New Rental inside one Add menu, since navigation already has a New Rental door', async () => {
      await renderMenu({ module: 'today' })

      expect(primaryButton()).toBeNull()
      expect(addTrigger()?.textContent).toContain('Add')
      expect(addTrigger()?.textContent).not.toContain('New Rental')
      expect(document.querySelector('.global-add-menu')).toBeNull()

      await act(async () => {
        addTrigger()!.click()
      })
      expect(menuItemText()).toEqual(['New Rental', 'New Client'])
      expect(location()).toBe('/today')
    })

    it('opens the real New Rental workspace from the menu, not the quick wizard', async () => {
      await renderMenu({ module: 'rentals' })
      await act(async () => {
        addTrigger()!.click()
      })
      const newRental = Array.from(document.querySelectorAll<HTMLButtonElement>('.global-add-menu__item')).find(
        (b) => b.textContent === 'New Rental'
      )
      await act(async () => {
        newRental!.click()
      })

      expect(location()).toBe('/rentals?action=new')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    })

    it('closes the menu on Escape', async () => {
      await renderMenu({ module: 'clients' })
      await act(async () => {
        chevron()!.click()
      })
      expect(document.querySelector('.global-add-menu')).not.toBeNull()

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })

      expect(document.querySelector('.global-add-menu')).toBeNull()
    })

    it('hides financial actions in the menu for the Warehouse role', async () => {
      mockRole = 'Warehouse'
      await renderMenu({ module: 'rentals' })
      await act(async () => {
        addTrigger()!.click()
      })
      const menuText = document.querySelector('.global-add-menu')?.textContent ?? ''
      expect(menuText).toContain('New Rental')
      expect(menuText).toContain('New Client')
      expect(menuText).not.toContain('New Quote')
    })

    it('runs a page-owned creation through the page handler and hides sibling flows that save nothing', async () => {
      const onSelect = vi.fn()
      await renderMenu({ module: 'documents', onSelectAction: onSelect })

      expect(primaryButton()?.textContent).toContain('New Document')
      await act(async () => {
        primaryButton()!.click()
      })
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'document.new' }))

      if (chevron()) {
        await act(async () => {
          chevron()!.click()
        })
        expect(menuItemText()).not.toContain('New Template')
        expect(menuItemText()).not.toContain('New Agreement')
      }
    })

    it('renders nothing where no working creation flow exists for the page', async () => {
      await renderMenu({ module: 'operations' })
      expect(primaryButton()).toBeNull()
      expect(addTrigger()).toBeNull()
    })

    it('offers New Equipment only to roles that hold inventory.create', () => {
      expect(getReadyContextualActions('inventory', 'Owner').defaultAction?.id).toBe('equipment.new')
      const warehouse = getReadyContextualActions('inventory', 'Warehouse')
      expect(warehouse.defaultAction).toBeNull()
      expect(warehouse.otherActions).toHaveLength(0)
    })

    it('never offers a creation flow that only shows a toast', () => {
      const ids = getReadyPermittedActions('Owner').map((a) => a.id)
      expect(ids.sort()).toEqual(['bundle.new', 'client.new', 'equipment.new', 'rental.new'])
      for (const id of ['quote.new', 'payment.record', 'expense.new', 'task.new', 'user.new']) {
        expect(ids).not.toContain(id)
      }
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

    it('lists no creation flow that only shows a toast', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CreationActionSearch isOpen={true} onClose={vi.fn()} onSelectAction={vi.fn()} />
          </MemoryRouter>
        )
      })

      const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement
      await act(async () => {
        searchInput.value = 'payment'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      })

      const labels = Array.from(container.querySelectorAll('.action-search-match')).map((m) => m.textContent)
      expect(labels.some((t) => t?.includes('Record Payment'))).toBe(false)
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
