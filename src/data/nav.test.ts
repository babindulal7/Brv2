import { describe, it, expect } from 'vitest'
import {
  NAV,
  SETTINGS_NAV,
  permittedNav,
  activeNavTo,
  bottomBarSlots,
  moreNav,
  isMoneySurface,
  SPEC_TABS,
} from './nav'

/**
 * The nav is a specification, not a preference — the updated wireframes' shell
 * block names eleven items in one order and repeats it identically in all
 * eleven spec files. These assertions exist so a future edit that drops one,
 * re-orders them, or re-opens the Law 6 money filter fails loudly instead of
 * shipping.
 *
 * They also pin the **active-row rule**, which is the one piece of real logic
 * here: `/rentals/new` (New Rental) is a prefix-child of `/rentals` (Rentals),
 * so the naive `startsWith` test the Sidebar used lit up both rows.
 */

describe('the fixed 11', () => {
  it('is exactly the wireframe list, in order', () => {
    expect(NAV.map((s) => s.label)).toEqual([
      'New Rental',
      'Today',
      'Operation', // singular — every spec file writes it that way
      'Rentals',
      'Calendar',
      'Crew Assist',
      'Inventory',
      'Clients',
      'Finance',
      'Tools',
      'Settings',
    ])
  })

  it('is flat — Operation queues are filter chips, not sidebar children', () => {
    expect(NAV.some((s) => s.children !== undefined)).toBe(false)
  })

  it('exports SETTINGS_NAV as item 11 itself, so the two cannot drift', () => {
    expect(SETTINGS_NAV).toBe(NAV[10])
  })
})

describe('Law 6 — money-blind roles never see money surfaces', () => {
  it('drops /finance for a money-blind role and keeps the other ten', () => {
    const warehouse = permittedNav('Warehouse')
    expect(warehouse.map((s) => s.to)).not.toContain('/finance')
    expect(warehouse).toHaveLength(10)
  })

  it('keeps all eleven for an Owner', () => {
    expect(permittedNav('Owner')).toHaveLength(11)
  })

  it('gives a signed-out visitor nothing', () => {
    expect(permittedNav(undefined)).toEqual([])
  })

  /**
   * Tools is nav item 10 for every role — `10_TOOLS.md` restricts none of its
   * four admin cards — but two of its six cards are calculators the same spec
   * draws in rupees (§10.2 WDV table, §10.3 VAT and discount). The gate is one
   * level down, on those two routes, and `ToolsLanding` + the Shell guard read
   * this same predicate so nav, page and typed URL cannot answer differently.
   */
  describe('the money surfaces are one list', () => {
    it('keeps Tools itself for a money-blind role', () => {
      expect(permittedNav('Warehouse').map((s) => s.to)).toContain('/tools')
      expect(isMoneySurface('/tools')).toBe(false)
    })

    it('marks the two Tools calculators, not the admin cards', () => {
      expect(isMoneySurface('/tools/pricing')).toBe(true)
      expect(isMoneySurface('/tools/depreciation')).toBe(true)
      expect(isMoneySurface('/tools/audit-log')).toBe(false)
      expect(isMoneySurface('/tools/activity-log')).toBe(false)
      expect(isMoneySurface('/tools/numbering')).toBe(false)
      expect(isMoneySurface('/tools/backup')).toBe(false)
    })

    it('covers the modules nav omits, so a typed URL is refused too', () => {
      expect(isMoneySurface('/finance')).toBe(true)
      expect(isMoneySurface('/finance/invoices')).toBe(true)
      expect(isMoneySurface('/reports/pulse')).toBe(true)
      expect(isMoneySurface('/admin/backup')).toBe(true)
    })

    it('matches on a path segment, never a bare prefix', () => {
      expect(isMoneySurface('/finance-notes')).toBe(false)
      expect(isMoneySurface('/toolsmith')).toBe(false)
    })

    it('strips the query, like activeNavTo', () => {
      expect(isMoneySurface('/finance?tab=invoices')).toBe(true)
    })
  })
})

describe('active row — most specific wins, exactly one owner', () => {
  const owner = permittedNav('Owner')
  const label = (path: string) => owner.find((s) => s.to === activeNavTo(owner, path))?.label ?? null

  it('/rentals/new is New Rental, not Rentals', () => {
    expect(label('/rentals/new')).toBe('New Rental')
  })

  it('/rentals is Rentals', () => {
    expect(label('/rentals')).toBe('Rentals')
  })

  it('/rentals/B-715 is Rentals', () => {
    expect(label('/rentals/B-715')).toBe('Rentals')
  })

  it('/rentals/B-715/packing is Rentals', () => {
    expect(label('/rentals/B-715/packing')).toBe('Rentals')
  })

  it('strips the query — /operations?queue=packing is Operation', () => {
    expect(label('/operations?queue=packing')).toBe('Operation')
  })

  it('never claims a sibling that merely shares a prefix', () => {
    expect(activeNavTo(owner, '/rentals-archive')).toBeNull()
  })

  it('returns one owner per route across every nav destination', () => {
    for (const s of owner) {
      const matches = owner.filter((c) => activeNavTo(owner, s.to) === c.to)
      expect(matches).toHaveLength(1)
    }
  })
})

describe('phone bottom bar — five fixed slots', () => {
  it('is Today · Rentals · Scan · Inventory · More for a permitted role', () => {
    expect(bottomBarSlots('Owner').map((s) => (s.kind === 'nav' ? s.section.label : s.kind))).toEqual([
      'Today',
      'Rentals',
      'scan',
      'Inventory',
      'more',
    ])
  })

  it('is the same fixed bar for a money-blind role — none of its slots is a money surface', () => {
    const slots = bottomBarSlots('Warehouse')
    expect(slots.map((s) => (s.kind === 'nav' ? s.section.to : s.kind))).toEqual([
      '/today',
      '/rentals',
      'scan',
      '/inventory',
      'more',
    ])
    /* Checked, not asserted in the title — the claim above is only worth having
       if the predicate the rest of the app gates on agrees with it. */
    expect(slots.every((s) => s.kind !== 'nav' || !isMoneySurface(s.section.to))).toBe(true)
  })

  it('keeps Scan in the centre even when a routed slot is filtered out', () => {
    /* A signed-out visitor resolves no routed slot at all; Scan must still come
       before More rather than sliding to the front of the bar. */
    expect(bottomBarSlots(undefined).map((s) => s.kind)).toEqual(['scan', 'more'])
  })

  it('gives a signed-out visitor no routed slots', () => {
    expect(bottomBarSlots(undefined).every((s) => s.kind !== 'nav')).toBe(true)
  })
})

describe('More sheet', () => {
  it('carries every nav item the bar cannot hold — including Clients', () => {
    expect(moreNav('Owner').map((s) => s.label)).toEqual([
      'New Rental',
      'Operation',
      'Calendar',
      'Crew Assist',
      'Clients', // TODO(decision) in data/nav.ts — absent from the spec's own list
      'Finance',
      'Tools',
      'Settings',
    ])
  })

  it('is still RBAC-filtered — Finance is absent for a money-blind role', () => {
    const warehouse = moreNav('Warehouse').map((s) => s.to)
    expect(warehouse).not.toContain('/finance')
    /* Tools stays: `10_TOOLS.md` restricts none of its admin cards, and its two
       calculators are gated one level down — see the money-surface suite. */
    expect(warehouse).toContain('/tools')
  })

  it('leaves no nav item unreachable on a phone', () => {
    const reachable = new Set([
      ...bottomBarSlots('Owner').flatMap((s) => (s.kind === 'nav' ? [s.section.to] : [])),
      ...moreNav('Owner').map((s) => s.to),
    ])
    expect(NAV.filter((s) => !reachable.has(s.to))).toEqual([])
  })
})

/**
 * **These pin the record, not the render.**
 *
 * `SPEC_TABS` is what the eleven specs ruled; the strips on screen still come
 * from each module's own constant (`data/inventory.ts`, `data/membership.ts`,
 * `data/settings.ts`) and two of them have not been brought across yet — the
 * table in `nav.ts`'s doc block names the delta. So read these as "the ruling is
 * still written down correctly", never as "the page shows this". When a module
 * batch re-points a page at `SPEC_TABS`, the assertion that it renders belongs
 * in that module's own test.
 */
describe('SPEC_TABS records what each updated spec ruled', () => {
  it('04_RENTALS — Bookings only, Sub-Rental is a chip, so no tabs', () => {
    expect(SPEC_TABS['/rentals']).toEqual([])
  })

  /* The one place a spec line was overridden rather than transcribed. Spec 08
     says "Directory only — no tabs"; the 12 Aug ruling keeps Memberships,
     because neither spec 08's client-record section nor spec 11's Settings
     matrix is a home for the plan catalogue in `modules/clients/Membership.tsx`.
     Crew does go — Crew Assist is nav item 6 now.
     `WIREFRAME_RULINGS_2026-08-12.md` §5. */
  it('08_CLIENTS — Memberships kept by ruling; Crew dropped to nav item 6', () => {
    expect(SPEC_TABS['/clients']).toEqual(['Clients', 'Memberships'])
  })

  it('07_INVENTORY — four tabs; Warehouses moved to Settings', () => {
    expect(SPEC_TABS['/inventory']).toEqual(['Equipment', 'Bundles', 'Stock Check', 'Maintenance'])
  })

  it('09_FINANCE — six tabs, Audit gone (it is a Tools card)', () => {
    expect(SPEC_TABS['/finance']).toEqual(['Dashboard', 'Invoices', 'Payments', 'Expenses', 'Documents', 'Reports'])
  })
})
