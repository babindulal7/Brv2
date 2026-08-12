import { describe, it, expect } from 'vitest'
import type { SystemRole } from '../../types/database'
import {
  canViewMoney,
  isStaff,
  canApproveDiscount,
  canVoidInvoice,
  canPerformOperations,
  canApproveDamage,
  canApproveLateFeeWaiver,
  canRecordPayment,
  canOverrideCreditLimit,
  canManageSettings,
} from '../rbac'

/**
 * The business 9. Written out rather than derived so that adding a tenth role
 * to `SystemRole` without deciding its money visibility fails here, loudly,
 * instead of defaulting into whichever branch happens to catch it.
 */
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

/* ── Law 6 · MONEY_BLIND membership ─────────────────────────────────────── */

describe('canViewMoney — Law 6', () => {
  it('blinds Warehouse, Technician, Driver and Client', () => {
    expect(canViewMoney('Warehouse')).toBe(false)
    expect(canViewMoney('Technician')).toBe(false)
    expect(canViewMoney('Driver')).toBe(false)
    expect(canViewMoney('Client')).toBe(false)
  })

  it('lets the five office roles see money', () => {
    expect(canViewMoney('Owner')).toBe(true)
    expect(canViewMoney('Admin')).toBe(true)
    expect(canViewMoney('Manager')).toBe(true)
    expect(canViewMoney('Coordinator')).toBe(true)
    expect(canViewMoney('Accounts')).toBe(true)
  })

  it('blinds exactly four of the nine — no more, no fewer', () => {
    const blind = ALL_ROLES.filter((r) => !canViewMoney(r))
    expect(blind).toEqual(['Warehouse', 'Technician', 'Driver', 'Client'])
    expect(blind).toHaveLength(4)
  })

  it('answers every role — no role falls through undefined', () => {
    for (const role of ALL_ROLES) expect(typeof canViewMoney(role)).toBe('boolean')
  })
})

describe('isStaff', () => {
  it('excludes only the external Client role', () => {
    expect(isStaff('Client')).toBe(false)
    for (const role of ALL_ROLES) {
      if (role === 'Client') continue
      expect(isStaff(role)).toBe(true)
    }
  })

  it('a money-blind role is not automatically external', () => {
    expect(canViewMoney('Warehouse')).toBe(false)
    expect(isStaff('Warehouse')).toBe(true)
  })
})

/* ── Law 10 · discount approval ─────────────────────────────────────────── */

describe('canApproveDiscount — Law 10', () => {
  it('caps at 25% for everyone, Owner included — no role bypass', () => {
    expect(canApproveDiscount('Owner', 25)).toBe(true)
    expect(canApproveDiscount('Owner', 25.01)).toBe(false)
    expect(canApproveDiscount('Owner', 30)).toBe(false)
    for (const role of ALL_ROLES) expect(canApproveDiscount(role, 26)).toBe(false)
  })

  it('lets Admin and Manager approve up to 15% and no further', () => {
    for (const role of ['Admin', 'Manager'] as const) {
      expect(canApproveDiscount(role, 15)).toBe(true)
      expect(canApproveDiscount(role, 15.01)).toBe(false)
      expect(canApproveDiscount(role, 20)).toBe(false)
    }
    // Owner keeps the band between 15 and 25 to itself.
    expect(canApproveDiscount('Owner', 20)).toBe(true)
  })

  it('gives no other role any approval authority', () => {
    for (const role of ['Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client'] as const) {
      expect(canApproveDiscount(role, 1)).toBe(false)
      expect(canApproveDiscount(role, 15)).toBe(false)
    }
  })

  it('treats a zero discount as needing no approval at all', () => {
    for (const role of ALL_ROLES) expect(canApproveDiscount(role, 0)).toBe(true)
  })

  it('blocks approval offline for every role, including Owner', () => {
    for (const role of ALL_ROLES) expect(canApproveDiscount(role, 5, false)).toBe(false)
    expect(canApproveDiscount('Owner', 0, false)).toBe(false)
  })
})

/* ── money actions ──────────────────────────────────────────────────────── */

describe('canVoidInvoice', () => {
  it('is Owner and Accounts only', () => {
    const allowed = ALL_ROLES.filter((r) => canVoidInvoice(r))
    expect(allowed).toEqual(['Owner', 'Accounts'])
  })

  it('is blocked offline — a void is a money action', () => {
    for (const role of ALL_ROLES) expect(canVoidInvoice(role, false)).toBe(false)
  })
})

describe('canRecordPayment', () => {
  it('is Owner, Coordinator and Accounts', () => {
    const allowed = ALL_ROLES.filter((r) => canRecordPayment(r))
    expect(allowed).toEqual(['Owner', 'Coordinator', 'Accounts'])
  })

  it('never grants a money-blind role the ability to take money', () => {
    for (const role of ALL_ROLES) {
      if (canViewMoney(role)) continue
      expect(canRecordPayment(role)).toBe(false)
    }
  })

  it('is blocked offline', () => {
    for (const role of ALL_ROLES) expect(canRecordPayment(role, false)).toBe(false)
  })
})

describe('canOverrideCreditLimit', () => {
  it('is Owner, Admin and Manager', () => {
    const allowed = ALL_ROLES.filter((r) => canOverrideCreditLimit(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager'])
  })

  it('is blocked offline', () => {
    for (const role of ALL_ROLES) expect(canOverrideCreditLimit(role, false)).toBe(false)
  })
})

/* ── operations and settings ────────────────────────────────────────────── */

describe('canPerformOperations', () => {
  it('is the floor plus the three management roles', () => {
    const allowed = ALL_ROLES.filter((r) => canPerformOperations(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'])
  })

  it('excludes Driver, Coordinator, Accounts and the external Client', () => {
    for (const role of ['Driver', 'Coordinator', 'Accounts', 'Client'] as const) {
      expect(canPerformOperations(role)).toBe(false)
    }
  })

  it('does not depend on connectivity — the floor works offline', () => {
    expect(canPerformOperations.length).toBe(1)
  })
})

describe('canManageSettings', () => {
  it('is Owner alone', () => {
    const allowed = ALL_ROLES.filter((r) => canManageSettings(r))
    expect(allowed).toEqual(['Owner'])
  })
})

/* ── the external role is never granted anything ────────────────────────── */

describe('the Client role holds no staff capability', () => {
  it('cannot see money, operate, take payment, void, override or configure', () => {
    expect(canViewMoney('Client')).toBe(false)
    expect(canPerformOperations('Client')).toBe(false)
    expect(canRecordPayment('Client')).toBe(false)
    expect(canVoidInvoice('Client')).toBe(false)
    expect(canOverrideCreditLimit('Client')).toBe(false)
    expect(canManageSettings('Client')).toBe(false)
    expect(canApproveDiscount('Client', 5)).toBe(false)
    expect(isStaff('Client')).toBe(false)
  })
})

/* ── damage sign-off — ruled 12 Aug 2026: Owner and Manager only ─────────── */

describe('canApproveDamage', () => {
  it('grants an Owner-level charge to the Owner alone', () => {
    const allowed = ALL_ROLES.filter((r) => canApproveDamage(r, 'Owner'))
    expect(allowed).toEqual(['Owner'])
  })

  it('grants a Manager-level charge to Owner and Manager, and nobody else', () => {
    const allowed = ALL_ROLES.filter((r) => canApproveDamage(r, 'Manager'))
    expect(allowed).toEqual(['Owner', 'Manager'])
  })

  /*
   * The regression this exists to catch. DamageTab.tsx used to compute the rule
   * inline as `role === 'Owner' || role === 'Admin' || role === 'Manager'`, so
   * an Admin could sign off a damage charge. The 12 Aug ruling excludes Admin.
   */
  it('excludes Admin at both levels', () => {
    expect(canApproveDamage('Admin', 'Manager')).toBe(false)
    expect(canApproveDamage('Admin', 'Owner')).toBe(false)
  })

  it('never lets a Manager sign off what the engine routed to the Owner', () => {
    expect(canApproveDamage('Manager', 'Manager')).toBe(true)
    expect(canApproveDamage('Manager', 'Owner')).toBe(false)
  })
})

/* ── late-fee waiver — lib/lateFee.ts:26, made enforceable ───────────────── */

describe('canApproveLateFeeWaiver', () => {
  it('is Owner and Manager, and nobody else', () => {
    const allowed = ALL_ROLES.filter((r) => canApproveLateFeeWaiver(r))
    expect(allowed).toEqual(['Owner', 'Manager'])
  })

  /*
   * Deliberately unlike canApproveDamage, which bands at Rs 25,000, and unlike
   * canApproveDiscount, which bands by percentage. lib/lateFee's
   * WAIVER_NEEDS_APPROVER is unconditional: waiving is giving money away, and the
   * direction is what makes it an approval, not the amount. A threshold here
   * would be an invented rule.
   */
  it('takes no amount — every waiver needs the same rank whatever its size', () => {
    expect(canApproveLateFeeWaiver.length).toBe(1)
  })

  it('excludes Admin and Accounts, who hold other money capabilities', () => {
    expect(canApproveLateFeeWaiver('Admin')).toBe(false)
    expect(canApproveLateFeeWaiver('Accounts')).toBe(false)
    expect(canVoidInvoice('Accounts')).toBe(true)
  })
})
