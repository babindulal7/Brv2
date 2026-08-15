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
  SYSTEM_ALERTS,
  LEGACY_TAB,
  DEFAULT_TAB,
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
import { FIELD_SECTIONS, FINANCIAL_SECTIONS } from '../sections'

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

describe('the four tabs — ruled 15 Aug 2026, down from eight', () => {
  it('is exactly the four, in order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Business', 'People', 'Branches', 'System'])
  })

  it('translates every retired key instead of dropping it on the default', () => {
    /*
     * A `?tab=` value is a URL contract — bookmarks and deep links carry one.
     * The four tabs that were merged away must LAND SOMEWHERE SENSIBLE, not on
     * whatever the default happens to be: someone who bookmarked the VAT rate
     * has to arrive at the VAT rate.
     */
    expect(LEGACY_TAB.financial).toBe('business')
    expect(LEGACY_TAB.organization).toBe('business')
    expect(LEGACY_TAB.overview).toBe('business')
    expect(LEGACY_TAB.users).toBe('people')
    expect(LEGACY_TAB.security).toBe('system')
    expect(LEGACY_TAB.integrations).toBe('system')
    /* Parked long before this cut, and still resolvable. */
    expect(LEGACY_TAB.communication).toBe('system')
    expect(LEGACY_TAB.ai).toBe('system')
  })

  it('no longer resolves a retired key as a live tab', () => {
    for (const key of ['overview', 'organization', 'financial', 'users', 'integrations', 'security', 'communication', 'ai']) {
      expect(isTabKey(key)).toBe(false)
    }
    for (const key of ['business', 'people', 'branches', 'system']) {
      expect(isTabKey(key)).toBe(true)
    }
    expect(isTabKey(DEFAULT_TAB)).toBe(true)
  })

  it('every legacy key points at a tab that exists', () => {
    for (const [from, to] of Object.entries(LEGACY_TAB)) {
      expect(isTabKey(to), `${from} → ${to} is not a tab`).toBe(true)
    }
  })

  it('carries no row whose only content is that it is not built', () => {
    /*
     * Twelve such rows across the old eight tabs were the single largest reason
     * Settings read as heavy — a row that exists to report its own absence is
     * one the reader must process and then discard. Seven were in Apps & API,
     * which is gone entirely.
     */
    const inert = Object.values(FIELD_SECTIONS)
      .flat()
      .flatMap((s) => (s ? s.fields : []))
      .filter((f) => f.dest?.kind === 'none')
    expect(inert.map((f) => f.label)).toEqual([])
  })

  it('points at no screen that was archived', () => {
    /*
     * The 12 Aug ruling archived six screens. Their Settings *sections* were
     * removed then, but the System card kept LINKING to them, so the doors
     * moved one level deeper instead of closing. This asserts they are closed.
     */
    const routes = new Set(
      [...Object.values(FIELD_SECTIONS).flat(), ...FINANCIAL_SECTIONS]
        .flatMap((s) => (s ? s.fields : []))
        .map((f) => f.dest)
        .filter((d) => d && d.kind === 'route')
        .map((d) => (d as { kind: 'route'; to: string }).to),
    )
    for (const gone of ['/automation', '/notifications', '/notifications/sms', '/notifications/inbox', '/ai', '/system', '/wall']) {
      expect(routes.has(gone), `${gone} is archived but still linked`).toBe(false)
    }
  })

  it('reaches the administration screens at one URL, not two', () => {
    /* `/tools/audit-log` and `/admin/audit-log` both used to mount the same
       component — four pages behind eight routes. `/admin/*` is the spelling. */
    const routes = Object.values(FIELD_SECTIONS)
      .flat()
      .flatMap((s) => (s ? s.fields : []))
      .map((f) => f.dest)
      .filter((d) => d && d.kind === 'route')
      .map((d) => (d as { kind: 'route'; to: string }).to)
    for (const admin of ['/admin/audit-log', '/admin/activity-log', '/admin/numbering', '/admin/backup', '/admin/audit']) {
      expect(routes).toContain(admin)
    }
    expect(routes.filter((r) => r.startsWith('/tools/'))).toEqual([])
  })

  it('deleted the orphaned destinations instead of re-pointing them', () => {
    const dests = [
      ...SYSTEM_ALERTS.map((a) => ({ label: a.text, dest: a.dest })),
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
  })

  it('deleted the AI Branch Insights card\u2019s data with it (Law 16)', () => {
    expect('BRANCH_INSIGHTS' in settings).toBe(false)
  })

  it('dropped the Overview-only exports rather than leaving them unrendered', () => {
    /* An exported list nothing renders reads as a live surface to the next
       person. The pane itself is at `src/archive/SettingsOverview.tsx`. */
    expect('QUICK_ACCESS' in settings).toBe(false)
    expect('MODULE_GROUPS' in settings).toBe(false)
  })
})

describe('Law 6 — the money gate moved down a level, it did not weaken', () => {
  it('no longer needs a money-gated TAB, because no tab is money-only', () => {
    expect(TABS.filter((t) => t.money)).toEqual([])
  })

  it('keeps the financial sections OUT of FIELD_SECTIONS, so the CSV export cannot leak them', () => {
    /*
     * The old `financial` tab was filtered out of `tabs` for a money-blind
     * session, and `exportConfig` walks `tabs` — so the gate covered the export
     * for free. Folding Financial into Business must not lose that: it reaches
     * the page through `FinancialPane` and the export through an explicit
     * `if (money)` in `Settings.tsx`.
     */
    const keys = Object.values(FIELD_SECTIONS).flat().map((s) => (s ? s.key : ''))
    for (const financial of FINANCIAL_SECTIONS) {
      expect(keys).not.toContain(financial.key)
    }
  })

  it('still drops a row aimed at a tab this session cannot see', () => {
    /* The helper is unchanged and still guards `kind: 'tab'` destinations. */
    expect(isDestVisible({ kind: 'tab', tab: 'people' }, TABS)).toBe(true)
    expect(isDestVisible({ kind: 'tab', tab: 'business' }, [])).toBe(false)
    expect(isDestVisible({ kind: 'route', to: '/finance' }, [])).toBe(true)
    expect(isDestVisible({ kind: 'none', why: 'x' }, [])).toBe(true)
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
    const vat = FINANCIAL_SECTIONS.flatMap((s) => s.fields).find((f) => f.settingKey === 'vatRatePercent')
    expect(vat?.readBy).toMatch(/New Rental/)
  })
})
