import { describe, it, expect } from 'vitest'
import type { SystemRole } from '../../types/database'
import {
  type MoneyField,
  gateContext,
  moneyScope,
  canViewMoneyField,
  canViewUtilization,
  canViewPII,
  canViewDocuments,
  canViewNotes,
  canViewOnStopReason,
} from '../fieldGating'
import { canViewMoney } from '../rbac'

/** The business 9. If `SystemRole` ever grows a tenth, this list fails to compile. */
const ALL_ROLES: readonly SystemRole[] = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
  'Technician',
  'Accounts',
  'Driver',
  'Client',
]

const MONEY_FIELDS: readonly MoneyField[] = ['booking', 'client-balance', 'asset-finance']

/* ── §4.1 · who sees rupees at all ──────────────────────────────────────── */

describe('canViewMoneyField — Law 6 / HIS v2.1 §4.1', () => {
  it('denies Warehouse, Technician, Driver and Client every booking money field', () => {
    for (const role of ['Warehouse', 'Technician', 'Driver', 'Client'] as const) {
      expect(canViewMoneyField(gateContext(role), 'booking')).toBe(false)
    }
  })

  it('denies those four roles EVERY money field, not just booking', () => {
    for (const role of ['Warehouse', 'Technician', 'Driver', 'Client'] as const) {
      for (const field of MONEY_FIELDS) {
        expect(canViewMoneyField(gateContext(role), field)).toBe(false)
      }
    }
  })

  it('grants Owner, Admin, Manager and Accounts all three fields', () => {
    for (const role of ['Owner', 'Admin', 'Manager', 'Accounts'] as const) {
      for (const field of MONEY_FIELDS) {
        expect(canViewMoneyField(gateContext(role), field)).toBe(true)
      }
    }
  })

  it('Coordinator sees booking money and client balance but NOT asset finance', () => {
    expect(canViewMoneyField(gateContext('Coordinator'), 'booking')).toBe(true)
    expect(canViewMoneyField(gateContext('Coordinator'), 'client-balance')).toBe(true)
    // §4.1: "no asset ROI, no crew pay, no supplier margin."
    expect(canViewMoneyField(gateContext('Coordinator'), 'asset-finance')).toBe(false)
  })

  it('Coordinator is the ONLY role with a partial money scope', () => {
    const partial = ALL_ROLES.filter((r) => moneyScope(gateContext(r)) === 'booking-and-client-balance')
    expect(partial).toEqual(['Coordinator'])
  })

  it('scopes exactly four roles to full money and four to none', () => {
    const full = ALL_ROLES.filter((r) => moneyScope(gateContext(r)) === 'full')
    const none = ALL_ROLES.filter((r) => moneyScope(gateContext(r)) === 'none')
    expect(full).toEqual(['Owner', 'Admin', 'Manager', 'Accounts'])
    expect(none).toEqual(['Warehouse', 'Technician', 'Driver', 'Client'])
  })
})

/* ── §4.3 · the floor context gate stacks, and the stricter wins ────────── */

describe('floor surfaces strip money even from capable roles — §4.3', () => {
  it('an Owner on the floor sees no money field', () => {
    for (const field of MONEY_FIELDS) {
      expect(canViewMoneyField(gateContext('Owner', { surface: 'floor' }), field)).toBe(false)
    }
    expect(canViewMoneyField(gateContext('Owner', { surface: 'default' }), 'asset-finance')).toBe(true)
  })

  it('no role — not one of the nine — sees money on a floor surface', () => {
    for (const role of ALL_ROLES) {
      expect(moneyScope(gateContext(role, { surface: 'floor' }))).toBe('none')
      for (const field of MONEY_FIELDS) {
        expect(canViewMoneyField(gateContext(role, { surface: 'floor' }), field)).toBe(false)
      }
    }
  })

  it('the surface defaults to "default", so omitting it never silently strips money', () => {
    expect(gateContext('Owner').surface).toBe('default')
    expect(canViewMoneyField(gateContext('Owner'), 'booking')).toBe(true)
  })
})

/* ── §4.1 · utilization rides with money ────────────────────────────────── */

describe('canViewUtilization', () => {
  it('is hidden on the floor from every role, Owner included', () => {
    for (const role of ALL_ROLES) {
      expect(canViewUtilization(gateContext(role, { surface: 'floor' }))).toBe(false)
    }
  })

  it('off the floor it tracks canViewMoney exactly — one rule, not two lists', () => {
    for (const role of ALL_ROLES) {
      expect(canViewUtilization(gateContext(role))).toBe(canViewMoney(role))
    }
  })

  it('Coordinator sees utilization even though its money scope is partial', () => {
    expect(canViewUtilization(gateContext('Coordinator'))).toBe(true)
  })
})

/* ── the two engines must not drift ─────────────────────────────────────── */

describe('fieldGating and rbac agree about who is money-blind', () => {
  it('a role rbac calls money-blind can never see a money field', () => {
    for (const role of ALL_ROLES) {
      if (canViewMoney(role)) continue
      for (const field of MONEY_FIELDS) {
        expect(canViewMoneyField(gateContext(role), field)).toBe(false)
      }
    }
  })

  it('a role with any money scope is a role rbac lets see money', () => {
    for (const role of ALL_ROLES) {
      if (moneyScope(gateContext(role)) === 'none') continue
      expect(canViewMoney(role)).toBe(true)
    }
  })
})

/* ── §4.2 · PII ─────────────────────────────────────────────────────────── */

describe('canViewPII — §4.2', () => {
  it('renders for the office roles always', () => {
    for (const role of ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'] as const) {
      expect(canViewPII(gateContext(role))).toBe(true)
    }
  })

  it('never renders for Warehouse or Technician, delivery context or not', () => {
    for (const role of ['Warehouse', 'Technician'] as const) {
      expect(canViewPII(gateContext(role))).toBe(false)
      expect(canViewPII(gateContext(role, { deliveryLinked: true }))).toBe(false)
    }
  })

  it('renders for a Driver ONLY inside a delivery context', () => {
    expect(canViewPII(gateContext('Driver'))).toBe(false)
    expect(canViewPII(gateContext('Driver', { deliveryLinked: false }))).toBe(false)
    expect(canViewPII(gateContext('Driver', { deliveryLinked: true }))).toBe(true)
  })

  it('never renders for the external Client role', () => {
    expect(canViewPII(gateContext('Client'))).toBe(false)
    expect(canViewPII(gateContext('Client', { deliveryLinked: true }))).toBe(false)
  })

  it('documents and the on-stop reason follow the same line as PII, by construction', () => {
    expect(canViewDocuments).toBe(canViewPII)
    expect(canViewOnStopReason).toBe(canViewPII)
    for (const role of ALL_ROLES) {
      expect(canViewDocuments(gateContext(role))).toBe(canViewPII(gateContext(role)))
    }
  })
})

describe('canViewNotes', () => {
  it('is staff-only', () => {
    expect(canViewNotes(gateContext('Client'))).toBe(false)
    for (const role of ALL_ROLES) {
      if (role === 'Client') continue
      expect(canViewNotes(gateContext(role))).toBe(true)
    }
  })
})
