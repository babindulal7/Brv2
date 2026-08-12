/**
 * The four claims `11_SETTINGS.md` makes that are cheap to break and expensive
 * to notice. Each one has already gone wrong once in this repo.
 *
 * 1. **The branch ▸ warehouse join reconciles per branch.** The old guard
 *    asserted the group total (4) and passed while Head Office held one
 *    warehouse against a declared two — §11.3's nested row would have drawn an
 *    empty child list with nothing complaining.
 * 2. **Automation · Channels/Communication · AI are gone**, and gone *with*
 *    their destinations rather than re-pointed at an unrelated section.
 * 3. **`FEE_PER_CREW_DAY_PAISA` has one definition.** It was declared twice at
 *    two different rupee figures, under the same exported name.
 * 4. **No figure is invented.** Deposit % per category and the cancellation fee
 *    tiers have no source in this build and must say so.
 */
import { describe, it, expect } from 'vitest'
import * as settings from '../../../data/settings'
import {
  BRANCHES,
  TABS,
  SEED_ERRORS,
  QUICK_ACCESS,
  SYSTEM_ALERTS,
  MODULE_GROUPS,
  MEMBERSHIP_MATRIX,
  WAREHOUSE_BRANCH_ID,
  isTabKey,
  isDestVisible,
  warehousesOfBranch,
} from '../../../data/settings'
import { WAREHOUSES } from '../../../data/warehouse'
import { PLANS } from '../../../data/membership'
import { FEE_PER_CREW_DAY_PAISA } from '../../../data/crew'
import { rupees } from '../../../lib/money'
import { FIELD_SECTIONS } from '../sections'

describe('§11.3 — the branch ▸ warehouse join', () => {
  it('reconciles per branch, not merely in total', () => {
    for (const b of BRANCHES) {
      expect(warehousesOfBranch(b.id)).toHaveLength(b.warehouses)
    }
  })

  it('leaves no warehouse without a branch, and names no branch that does not exist', () => {
    const branchIds = new Set(BRANCHES.map((b) => b.id))
    for (const w of WAREHOUSES) {
      const owner = WAREHOUSE_BRANCH_ID[w.id]
      expect(owner, `${w.code} has no branch`).toBeDefined()
      expect(branchIds.has(owner as string), `${w.code} points at ${owner}`).toBe(true)
    }
    for (const id of Object.keys(WAREHOUSE_BRANCH_ID)) {
      expect(WAREHOUSES.some((w) => w.id === id), `join names unknown warehouse ${id}`).toBe(true)
    }
  })

  it('reports nothing — the seed reconciles, so the page shows no banner', () => {
    expect(SEED_ERRORS).toEqual([])
  })

  it('states that rack counts are not tracked rather than deriving one', () => {
    /* `STORAGE_LOCATIONS` covers 9 bins against 20 declared zones, so any rack
       count derived from it would be wrong and confident. */
    expect(settings.RACKS_NOT_TRACKED).toMatch(/not tracked yet/)
    expect(WAREHOUSES.every((w) => !('rackCount' in w))).toBe(true)
  })
})

describe('§11.2 — the eight sections, and the three that were parked', () => {
  it('is exactly the spec’s eight, in its order', () => {
    expect(TABS.map((t) => t.label)).toEqual([
      'Overview',
      'Organisation',
      'Branches & Warehouses',
      'Users & Roles',
      'Financial',
      'System',
      'Apps & API',
      'Security',
    ])
  })

  it('no longer resolves the parked tab keys, so a stale link falls back rather than 404s', () => {
    expect(isTabKey('communication')).toBe(false)
    expect(isTabKey('ai')).toBe(false)
    /* The keys that ARE live are the URL contract — renaming one breaks every
       deep link and every Administration Modules row that points at it. */
    for (const key of ['overview', 'organization', 'branches', 'users', 'financial', 'system', 'integrations', 'security']) {
      expect(isTabKey(key)).toBe(true)
    }
  })

  it('deleted the orphaned destinations instead of re-pointing them', () => {
    const dests = [
      ...QUICK_ACCESS.map((q) => ({ label: q.label, dest: q.dest })),
      ...SYSTEM_ALERTS.map((a) => ({ label: a.text, dest: a.dest })),
      ...MODULE_GROUPS.flatMap((g) => g.rows),
      ...Object.values(FIELD_SECTIONS)
        .flat()
        .flatMap((s) => (s ? s.fields : []))
        .filter((f) => f.dest)
        .map((f) => ({ label: f.label, dest: f.dest! })),
    ]

    /* No row survived by being aimed somewhere else: a WhatsApp token alert
       filed under Security is worse than no alert. */
    for (const label of ['WhatsApp', 'Email & SMS Settings', 'AI Settings', 'AI Models', 'AI permissions']) {
      expect(dests.filter((d) => d.label.includes(label))).toEqual([])
    }
    expect(MODULE_GROUPS.map((g) => g.title)).not.toContain('Communication Settings')
    expect(MODULE_GROUPS.map((g) => g.title)).not.toContain('AI & Automation')
  })

  it('keeps every routed screen reachable — parking a section orphaned no page', () => {
    const routes = new Set(
      Object.values(FIELD_SECTIONS)
        .flat()
        .flatMap((s) => (s ? s.fields : []))
        .map((f) => f.dest)
        .filter((d) => d && d.kind === 'route')
        .map((d) => (d as { kind: 'route'; to: string }).to),
    )
    for (const route of ['/automation', '/notifications', '/notifications/sms', '/notifications/inbox', '/ai', '/system']) {
      expect(routes.has(route), `${route} lost its only door`).toBe(true)
    }
  })

  it('deleted the AI Branch Insights card’s data with it (Law 16)', () => {
    expect('BRANCH_INSIGHTS' in settings).toBe(false)
  })
})

describe('Law 6 — the money tab is removed, and so is anything pointing at it', () => {
  it('marks Financial as the one money tab', () => {
    expect(TABS.filter((t) => t.money).map((t) => t.key)).toEqual(['financial'])
  })

  it('drops a row aimed at a tab this session cannot see', () => {
    const blind = TABS.filter((t) => !t.money)
    expect(isDestVisible({ kind: 'tab', tab: 'financial' }, blind)).toBe(false)
    expect(isDestVisible({ kind: 'tab', tab: 'users' }, blind)).toBe(true)
    /* A route or an inert row is unaffected — this filter is about tabs only. */
    expect(isDestVisible({ kind: 'route', to: '/finance' }, blind)).toBe(true)
    expect(isDestVisible({ kind: 'none', why: 'x' }, blind)).toBe(true)
  })
})

describe('§11.4 Financial — one fee definition, no invented figures', () => {
  it('no longer exports a second crew-day fee under the same name', () => {
    /* Rulings §9.11: `data/settings.ts` used to export rupees(500) beside
       `data/crew.ts`'s rupees(1000). Splitting this file was exactly when
       someone would have imported the wrong one by name. */
    expect('FEE_PER_CREW_DAY_PAISA' in settings).toBe(false)
    expect(FEE_PER_CREW_DAY_PAISA).toBe(rupees(1000))
  })

  it('renders “not tracked yet” for the two panels with no source', () => {
    expect(settings.DEPOSIT_BY_CATEGORY_UNAVAILABLE).toMatch(/not tracked yet/)
    expect(settings.CANCELLATION_TIERS_UNAVAILABLE).toMatch(/not tracked yet/)
    /* And neither carries a percentage anyone could mistake for a rule. */
    expect(settings.DEPOSIT_BY_CATEGORY_UNAVAILABLE).not.toMatch(/\d+\s?%/)
    expect(settings.CANCELLATION_TIERS_UNAVAILABLE).not.toMatch(/\d+\s?%/)
  })

  it('projects the membership matrix from the plan list rather than retyping it', () => {
    expect(MEMBERSHIP_MATRIX.map((m) => m.level)).toEqual(PLANS.map((p) => p.name))
    for (const m of MEMBERSHIP_MATRIX) {
      const plan = PLANS.find((p) => p.name === m.level)!
      expect(plan.discounts[0]).toContain(m.discount)
      expect(plan.limits.map((l) => l.value)).toContain(m.credit)
    }
  })

  it('names the screens that read the VAT rate, so “none is hardcoded” is checkable', () => {
    const vat = FIELD_SECTIONS.financial?.flatMap((s) => s.fields).find((f) => f.settingKey === 'vatRatePercent')
    expect(vat?.readBy).toMatch(/New Rental/)
  })
})
