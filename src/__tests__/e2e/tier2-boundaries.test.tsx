// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Babin Shrestha',
  role: 'Owner' as const,
  isSharedDevice: false,
}

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isLocked: false,
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
  useTabularLayout: () => true,
}))

vi.mock('../../lib/network', () => ({
  useNetwork: () => true,
}))

vi.mock('../../lib/syncContext', () => ({
  useSync: () => ({
    status: 'synced',
    pendingCount: 0,
    error: null,
    triggerSync: vi.fn(),
  }),
}))

vi.mock('../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showToast: vi.fn(),
  }),
}))

vi.mock('../../modules/operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useOperationsWorkspace: () => ({
    openOperations: vi.fn(),
    closeOperations: vi.fn(),
  }),
}))

vi.mock('../../lib/supabase', () => ({
  newClientUuid: () => '11111111-1111-4111-8111-111111111111',
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

import { validateDiscount } from '../../lib/discount'
import {
  calculatePricingPipeline,
  DISCOUNT_STACKING_CAP_PERCENT,
  type PricingPipelineInput,
} from '../../lib/pricingPipeline'
import { settleDeposit, validateDamageReport } from '../../lib/damage'
import { rupees } from '../../lib/money'
import { equipmentConflicts, type ConflictCheckLine } from '../../modules/rentals/booking/itemCatalogue'
import Header from '../../components/shell/Header'
import Sidebar from '../../components/shell/Sidebar'
import DashboardMovementPanel from '../../modules/today/DashboardMovementPanel'
import type { MovementRow } from '../../lib/queries/today'
import { EmptyState } from '../../components/ui/StateViews'

let container: HTMLDivElement
let root: Root

async function mount(ui: React.ReactNode, initialEntries = ['/']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)
  })
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  container?.remove()
})

describe('Tier 2: Boundaries, Corner Cases & Guardrails', () => {
  describe('Boundary 1: Standard Empty States', () => {
    it('renders concise empty notice without broken buttons or verbose apologetic text', async () => {
      await mount(
        <EmptyState
          title="No rentals found"
          description="Try adjusting your date range or filter criteria to find bookings."
        />
      )

      expect(container.textContent).toContain('No rentals found')
      expect(container.textContent).toContain('Try adjusting your date range or filter criteria')
      expect(container.textContent).not.toContain('undefined')
      expect(container.textContent).not.toContain('NaN')
      expect(container.textContent).not.toContain('NullPointerException')
    })
  })

  describe('Boundary 2: Equipment Contention & Overlap Banners', () => {
    it('detects inventory contention when requested quantity exceeds available pool', () => {
      const FX3 = 'aaaaaaaa-0000-4000-8000-000000000001'
      const line: ConflictCheckLine = {
        id: FX3,
        name: 'Sony FX3 Cinema Camera',
        qty: 3,
      }

      // Fleet has 4 units, 3 are held by other bookings, only 1 free for dates
      const liveAvailability = {
        state: 'ready' as const,
        byProduct: new Map([
          [
            FX3,
            {
              productId: FX3,
              mode: 'unit' as const,
              unitsOwned: 4,
              unitsFree: 1,
              unitsHeld: 3,
              heldBy: ['BK-2026-0710', 'BK-2026-0711', 'BK-2026-0712'],
            },
          ],
        ]),
      }

      const summary = equipmentConflicts([line], liveAvailability)
      expect(summary.conflicts.length).toBeGreaterThan(0)
      expect(summary.conflicts[0]?.productId).toBe(FX3)
      expect(summary.conflicts[0]?.needed).toBe(3)
      expect(summary.conflicts[0]?.free).toBe(1)
      expect(summary.conflicts[0]?.text).toContain('3 units wanted, 1 free for these dates')
      expect(summary.conflicts[0]?.text).toContain('BK-2026-0710')
    })
  })

  describe('Boundary 3: Overdue Returns Alerts', () => {
    it('renders actionable overdue alert banner and card highlight when overdue returns exist', async () => {
      const overdueRow: MovementRow = {
        id: 'rental-overdue-1',
        bookingNo: 'BK-2026-0901',
        clientId: 'client-1',
        client: 'Kathmandu Films',
        monogram: 'KF',
        avatarTone: 'danger',
        kind: 'Return',
        at: 600,
        atDayAd: '2026-09-20',
        status: 'On Rent',
        flags: ['Overdue'],
        statusNote: '2 days overdue',
        project: 'Documentary',
        itemCount: 4,
        due: 'Due 20 Sept 2026 · 10:00 AM',
        duration: '18 Sept → 20 Sept',
        pickupLocation: null,
        returnLocation: null,
        deliveryType: 'Client Pickup',
      }

      await mount(
        <DashboardMovementPanel
          side="incoming"
          title="Returns"
          subtitle="Scheduled returns"
          icon="truck"
          periodLabel="today"
          filterControl={null}
          onClearFilters={() => {}}
          list={{
            rows: [overdueRow],
            total: 1,
            loading: false,
            error: null,
            isEmpty: false,
            isFiltered: false,
            refetch: () => {},
            lastFetchedAt: null,
          }}
        />,
      )

      expect(container.textContent).toContain('Kathmandu Films')
      expect(container.textContent).toContain('BK-2026-0901')
      const card = container.querySelector('.movement-card--overdue')
      expect(card).not.toBeNull()
      expect(container.textContent).toContain('2 days overdue')
      const action = container.querySelector<HTMLButtonElement>('.movement-card__cta-btn')
      expect(action).not.toBeNull()
      expect(action?.textContent).toContain('Return')
    })
  })

  describe('Boundary 4: Law 10 Discount Gates & 25% Stacking Cap', () => {
    it('rejects negative discounts and discounts exceeding 100%', () => {
      const negativeResult = validateDiscount(-5)
      expect(negativeResult.valid).toBe(false)
      expect(negativeResult.error).toContain('negative')

      const excessiveResult = validateDiscount(105)
      expect(excessiveResult.valid).toBe(false)
      expect(excessiveResult.error).toContain('above 100%')

      const validResult = validateDiscount(10)
      expect(validResult.valid).toBe(true)
      expect(validResult.error).toBeNull()
    })

    it('enforces Law 10 hard 25% discount stacking cap across multiple discount sources', () => {
      const input: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(100000), // Rs 100,000
        bundleSubtotalPaisa: rupees(0),
        servicesSubtotalPaisa: rupees(0),
        crewSubtotalPaisa: rupees(0),
        deliveryChargePaisa: rupees(0),
        fuelChargePaisa: rupees(0),
        vatEnabled: true,
        discounts: {
          membershipPercent: 10,
          durationPercent: 10,
          womenDopEligible: true, // 5%
          manualDiscountPercent: 10, // 10%
          // Total raw = 10 + 10 + 5 + 10 = 35%
        },
      }

      const result = calculatePricingPipeline(input)

      // Raw total is 35%, but applied MUST be capped at exactly 25%
      expect(result.discounts.rawTotalPercent).toBe(35)
      expect(result.discounts.appliedPercent).toBe(DISCOUNT_STACKING_CAP_PERCENT) // 25
      expect(result.discounts.capped).toBe(true)

      // Discount amount must equal exactly 25% of Rs 100,000 = Rs 25,000 (2,500,000 paisa)
      expect(result.discounts.discountPaisa).toBe(rupees(25000))

      // Taxable subtotal must be Rs 75,000
      expect(result.taxableSubtotalPaisa).toBe(rupees(75000))
    })
  })

  describe('Boundary 5: Law 5 Security Deposit Liability & Settlement', () => {
    it('isolates security deposits as liabilities outside Rental Total', () => {
      const input: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(50000), // Rs 50,000
        bundleSubtotalPaisa: rupees(0),
        servicesSubtotalPaisa: rupees(0),
        crewSubtotalPaisa: rupees(0),
        deliveryChargePaisa: rupees(0),
        fuelChargePaisa: rupees(0),
        vatEnabled: true, // 13% VAT
        recommendedDepositPaisa: rupees(20000), // Deposit Rs 20,000
      }

      const result = calculatePricingPipeline(input)

      // Subtotal = 50,000, VAT 13% = 6,500, Rental Total = 56,500
      expect(result.grossSubtotalPaisa).toBe(rupees(50000))
      expect(result.vatPaisa).toBe(rupees(6500))
      expect(result.rentalTotalPaisa).toBe(rupees(56500))

      // Law 5: Deposit is strictly isolated and NEVER included in rentalTotalPaisa
      expect(result.rentalTotalPaisa).not.toContain(rupees(76500))
      expect(result.securityDeposit.requiredPaisa).toBe(rupees(20000))

      // Grand total requirement separates rental total from deposit liability
      expect(result.grandTotalRequirementPaisa).toBe(rupees(76500))
    })

    it('settles security deposit correctly: refund is non-negative and shortfall is separate', () => {
      // Case A: Damage is less than deposit
      const caseA = settleDeposit(rupees(30000), rupees(10000))
      expect(caseA.refundPaisa).toBe(rupees(20000))
      expect(caseA.shortfallPaisa).toBe(rupees(0))
      expect(caseA.fullyConsumed).toBe(false)

      // Case B: Damage exactly equals deposit
      const caseB = settleDeposit(rupees(30000), rupees(30000))
      expect(caseB.refundPaisa).toBe(rupees(0))
      expect(caseB.shortfallPaisa).toBe(rupees(0))
      expect(caseB.fullyConsumed).toBe(true)

      // Case C: Damage exceeds deposit
      const caseC = settleDeposit(rupees(30000), rupees(45000))
      expect(caseC.refundPaisa).toBe(rupees(0)) // Refund never goes negative
      expect(caseC.shortfallPaisa).toBe(rupees(15000)) // Rs 15,000 shortfall receivable
      expect(caseC.fullyConsumed).toBe(true)
    })

    it('validates damage report: requires photo evidence, min description length, and approver threshold', () => {
      // Missing photo
      const invalidPhotos = validateDamageReport({
        photos: 0,
        description: 'Camera sensor cracked on drop',
        chargePaisa: rupees(15000),
        replacementPaisa: rupees(100000),
      })
      expect(invalidPhotos.valid).toBe(false)
      expect(invalidPhotos.errors.photos).toBeDefined()

      // Description too short (< 10 chars)
      const shortDesc = validateDamageReport({
        photos: 2,
        description: 'Broken',
        chargePaisa: rupees(15000),
        replacementPaisa: rupees(100000),
      })
      expect(shortDesc.valid).toBe(false)
      expect(shortDesc.errors.description).toBeDefined()

      // Manager threshold (< Rs 25,000)
      const managerSignoff = validateDamageReport({
        photos: 2,
        description: 'Scratched front element on 24-70mm lens',
        chargePaisa: rupees(20000),
        replacementPaisa: rupees(120000),
      })
      expect(managerSignoff.valid).toBe(true)
      expect(managerSignoff.approver).toBe('Manager')

      // Owner threshold (>= Rs 25,000)
      const ownerSignoff = validateDamageReport({
        photos: 3,
        description: 'Internal circuit board water damage on FX3 body',
        chargePaisa: rupees(65000),
        replacementPaisa: rupees(380000),
      })
      expect(ownerSignoff.valid).toBe(true)
      expect(ownerSignoff.approver).toBe('Owner')
    })
  })

  describe('Boundary 6: Law 15 Touch Target Audit (>= 44x44px)', () => {
    it('ensures shell interactive controls maintain minimum 44px hit dimensions', async () => {
      await mount(
        <div>
          <Header crumbs={[{ label: 'Rentals' }]} />
          <Sidebar active="/rentals" />
        </div>
      )

      // Command palette button
      const searchBtn = container.querySelector('button[aria-label="Search bookings, clients, equipment and pages"]') as HTMLElement
      expect(searchBtn).not.toBeNull()
      const searchStyle = searchBtn.style
      expect(Number.parseInt(searchStyle.minHeight, 10)).toBeGreaterThanOrEqual(44)

      // User profile trigger
      const profileBtn = container.querySelector('button[aria-label*="user profile"]') as HTMLElement
      expect(profileBtn).not.toBeNull()
      expect(Number.parseInt(profileBtn.style.minHeight, 10)).toBeGreaterThanOrEqual(44)

      // Navigation links in sidebar
      const navLinks = [...container.querySelectorAll('nav[aria-label="Main"] a')] as HTMLElement[]
      expect(navLinks.length).toBeGreaterThan(0)
      for (const link of navLinks) {
        expect(Number.parseInt(link.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
      }
    })
  })
})
