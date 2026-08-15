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
  canConfirmRental,
  canCreateClient,
  canBlockClient,
  canCreateBundle,
  canWriteBookingDesk,
  canWriteFloor,
  canMergeClients,
  canWriteSharedTriage,
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

/* -- the four ruled 15 Aug 2026 by mirroring live RLS -- PLAN.md 4.20 -------- */

/*
 * Each of these asserts a role set that was READ OFF THE DATABASE, not chosen.
 * If one of them ever fails, the question to ask is whether the RLS policy it
 * mirrors was changed -- because a rule granted here and denied at the row is
 * the exact failure lib/rbac's header says it exists to prevent.
 */

describe('canConfirmRental', () => {
  it('is the booking desk and the floor, mirroring booking_stage_transitions_insert', () => {
    const allowed = ALL_ROLES.filter((r) => canConfirmRental(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'])
  })

  /*
   * The contrast that made borrowing `operations.perform` wrong, stated as a
   * test so it cannot be quietly re-merged later. The two sets differ in BOTH
   * directions.
   */
  it('is not canPerformOperations: it admits Coordinator and excludes Technician', () => {
    expect(canConfirmRental('Coordinator')).toBe(true)
    expect(canPerformOperations('Coordinator')).toBe(false)

    expect(canConfirmRental('Technician')).toBe(false)
    expect(canPerformOperations('Technician')).toBe(true)
  })

  it('excludes Accounts, Driver and the external Client', () => {
    expect(canConfirmRental('Accounts')).toBe(false)
    expect(canConfirmRental('Driver')).toBe(false)
    expect(canConfirmRental('Client')).toBe(false)
  })
})

describe('canCreateClient', () => {
  it('mirrors clients_insert -- the same five as confirm', () => {
    const allowed = ALL_ROLES.filter((r) => canCreateClient(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'])
  })

  it('includes Coordinator, whose job is taking a walk-in client details', () => {
    expect(canCreateClient('Coordinator')).toBe(true)
  })
})

describe('canBlockClient', () => {
  it('mirrors the Blocked branch of client_flags_insert -- narrower than creating one', () => {
    const allowed = ALL_ROLES.filter((r) => canBlockClient(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager'])
  })

  /*
   * The database itself draws this line: client_flags_insert splits on
   * flag_type, so Coordinator and Warehouse may raise every OTHER flag on a
   * client and not this one.
   */
  it('is strictly narrower than canCreateClient', () => {
    const blockers = ALL_ROLES.filter((r) => canBlockClient(r))
    const creators = ALL_ROLES.filter((r) => canCreateClient(r))
    expect(blockers.every((r) => creators.includes(r))).toBe(true)
    expect(blockers.length).toBeLessThan(creators.length)

    expect(canCreateClient('Coordinator')).toBe(true)
    expect(canBlockClient('Coordinator')).toBe(false)
    expect(canBlockClient('Warehouse')).toBe(false)
  })
})

describe('canCreateBundle', () => {
  it('mirrors bundles_manage, not bundle_items_all', () => {
    const allowed = ALL_ROLES.filter((r) => canCreateBundle(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager'])
  })

  /*
   * createBundle writes bundles AND bundle_items. bundle_items_all admits
   * Warehouse; bundles_manage does not. Granting the wider set would pass this
   * check and then fail at the first insert -- forbidden must be absent, not
   * attempted and refused.
   */
  it('excludes Warehouse, who may add items to a bundle that already exists', () => {
    expect(canCreateBundle('Warehouse')).toBe(false)
  })
})

/* ── The four role sets ruled 16 Aug 2026 ────────────────────────────────────
 *
 * Same method and same warning as the block above: each list is an RLS policy
 * read off the live project, not a preference. A failure here means either the
 * policy moved or someone edited the predicate -- and the two must not drift.
 *
 * These four cover 21 capability strings between them. Derivation:
 * CAPABILITY_MAPPING_2026-08-16.md §4.
 * ─────────────────────────────────────────────────────────────────────────── */

describe('canWriteBookingDesk', () => {
  it('mirrors bookings_insert / booking_lines_all / clients_update', () => {
    const allowed = ALL_ROLES.filter((r) => canWriteBookingDesk(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'])
  })

  /* It is the same set BOOKING_DESK was named for, so the three 15 Aug rules
     built on it must agree exactly. If they ever diverge, one of them was
     edited without its policy moving. */
  it('is the same set as canConfirmRental and canCreateClient', () => {
    for (const role of ALL_ROLES) {
      expect(canWriteBookingDesk(role)).toBe(canConfirmRental(role))
      expect(canWriteBookingDesk(role)).toBe(canCreateClient(role))
    }
  })
})

describe('canWriteFloor', () => {
  it('mirrors operation_sessions_all -- the desk minus Coordinator', () => {
    const allowed = ALL_ROLES.filter((r) => canWriteFloor(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager', 'Warehouse'])
  })

  /*
   * The A/B split is the whole point of having two sets: taking a booking is
   * desk work, moving the gear is not. Coordinator is in exactly one of them.
   */
  it('excludes Coordinator, who canWriteBookingDesk admits', () => {
    expect(canWriteBookingDesk('Coordinator')).toBe(true)
    expect(canWriteFloor('Coordinator')).toBe(false)
  })

  /*
   * And it is NOT canPerformOperations, which admits Technician. Writing the
   * session row and working a session someone else opened are different acts;
   * collapsing them is the mistake this pins shut.
   */
  it('excludes Technician, who canPerformOperations admits', () => {
    expect(canPerformOperations('Technician')).toBe(true)
    expect(canWriteFloor('Technician')).toBe(false)
  })
})

describe('canMergeClients', () => {
  it('mirrors client_merges_all -- Owner, Admin, Manager', () => {
    const allowed = ALL_ROLES.filter((r) => canMergeClients(r))
    expect(allowed).toEqual(['Owner', 'Admin', 'Manager'])
  })

  /* Merging is irreversible in a way editing is not, and the database says so
     itself: client_merges_all is three roles, clients_update is five. */
  it('is strictly narrower than canWriteBookingDesk', () => {
    const mergers = ALL_ROLES.filter((r) => canMergeClients(r))
    const writers = ALL_ROLES.filter((r) => canWriteBookingDesk(r))
    expect(mergers.every((r) => writers.includes(r))).toBe(true)
    expect(mergers.length).toBeLessThan(writers.length)
  })
})

describe('canWriteSharedTriage', () => {
  it('mirrors auth_is_staff() -- every staff role, Client excluded', () => {
    const allowed = ALL_ROLES.filter((r) => canWriteSharedTriage(r))
    expect(allowed).toEqual([
      'Owner',
      'Admin',
      'Manager',
      'Coordinator',
      'Warehouse',
      'Technician',
      'Accounts',
      'Driver',
    ])
    expect(canWriteSharedTriage('Client')).toBe(false)
  })

  /*
   * ⚠ This test PINS A KNOWN-BROAD RULE, deliberately. purchase_requests_all is
   * auth_is_staff() on the live project, so mirroring it admits Driver and
   * Technician to `purchase.approve` -- a spend-authorising verb.
   *
   * It is asserted rather than quietly narrowed because the fix belongs in the
   * RLS policy, not here (PLAN.md §4.29). When that policy is tightened, THIS
   * TEST SHOULD FAIL -- that failure is the signal to split the set, and is the
   * only thing standing between a policy change and a silent app/DB drift.
   */
  it('admits Driver and Technician -- the known-broad case, pinned on purpose', () => {
    expect(canWriteSharedTriage('Driver')).toBe(true)
    expect(canWriteSharedTriage('Technician')).toBe(true)
  })
})
