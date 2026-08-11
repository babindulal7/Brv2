/**
 * Field-level gating — Hover Intel System v2.1 §4.
 *
 * `lib/rbac.ts` answers action-level questions ("can this role record a
 * payment"). This file answers a narrower, card-specific question: for one
 * field inside a Glance/Detail card, given a role and where the card is
 * rendered, should the caller construct that field at all?
 *
 * Every function here is a pure predicate. Nothing renders and nothing knows
 * about `IntelCard` — the caller (a card builder such as `clientIntel.ts`)
 * calls these while building an `IntelGroup[]`, and a field the predicate
 * refuses is simply never pushed onto the array. That is what HIS v2.1 §4.5
 * means by "gated blocks are omitted from the payload, not CSS-hidden": the
 * omission has to happen here, before the component ever sees the field —
 * there is no later CSS or conditional-render step that would make hiding it
 * acceptable.
 */

import type { SystemRole } from '../types/database'
import { canViewMoney } from './rbac'

/**
 * §4.3: "Context gate stacks and the stricter wins: on Floor surfaces
 * (Pack/Handover/Return/Reset/Scanner) all ₨ is stripped even for capable
 * roles." `'default'` is every other surface — the directories, detail
 * pages, and dashboards this system was designed for first.
 */
export type Surface = 'default' | 'floor'

export interface GateContext {
  role: SystemRole
  surface?: Surface
  /**
   * §4.2: Driver PII renders "only inside a delivery context — that
   * booking's delivery address + phone — nowhere else." True only when this
   * card is scoped to the one delivery/booking the Driver is assigned to.
   */
  deliveryLinked?: boolean
}

function ctx(role: SystemRole, opts?: Omit<GateContext, 'role'>): GateContext {
  return { role, surface: 'default', ...opts }
}
export { ctx as gateContext }

/**
 * §4.1: "Owner/Admin/Manager/Accounts = all ₨. Coordinator = booking-level
 * money + client balance/deposit only (no asset ROI, no crew pay, no
 * supplier margin). Warehouse/Technician/Driver = no ₨ anywhere."
 */
export type MoneyScope = 'full' | 'booking-and-client-balance' | 'none'

const MONEY_FULL: ReadonlySet<SystemRole> = new Set(['Owner', 'Admin', 'Manager', 'Accounts'])

export function moneyScope(c: GateContext): MoneyScope {
  // Context gate stacks, stricter wins — a Floor surface strips money even
  // for a role that would otherwise see all of it.
  if (c.surface === 'floor') return 'none'
  if (MONEY_FULL.has(c.role)) return 'full'
  if (c.role === 'Coordinator') return 'booking-and-client-balance'
  return 'none'
}

/** The four money field categories §4.1 actually distinguishes. */
export type MoneyField = 'booking' | 'client-balance' | 'asset-finance'

export function canViewMoneyField(c: GateContext, field: MoneyField): boolean {
  const scope = moneyScope(c)
  if (scope === 'full') return true
  if (scope === 'none') return false
  return field === 'booking' || field === 'client-balance'
}

/**
 * §4.1: "...and no utilization%" for the three money-blind floor roles.
 * The Equipment card's Utilization group states this again as "visible to
 * Manager+; hidden from floor" — the same rule stated twice, so it is not
 * re-derived from a separate list here.
 */
export function canViewUtilization(c: GateContext): boolean {
  if (c.surface === 'floor') return false
  return canViewMoney(c.role)
}

/**
 * §4.2: "phone/email/address render for Coordinator/Admin/Owner/Accounts
 * always; for Driver only inside a delivery context...; never for
 * Warehouse/Technician."
 */
const PII_ALWAYS: ReadonlySet<SystemRole> = new Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'])

export function canViewPII(c: GateContext): boolean {
  if (PII_ALWAYS.has(c.role)) return true
  if (c.role === 'Driver') return c.deliveryLinked === true
  return false
}

/**
 * Client card, Documents group: "Gated to Coordinator+." No rank order is
 * defined anywhere in the spec, so this reuses the same office-staff set PII
 * already draws the line at — the roles who can see a client's phone number
 * are the roles who can see their uploaded ID, not a separately-invented
 * tier.
 */
export const canViewDocuments = canViewPII

/**
 * Client card, Notes group: "Staff only, never Client role." The Client
 * (portal) role cannot reach this screen at all today — `rbac.ts`'s
 * `isStaff()` / the routing guard is what actually enforces that — but a
 * card builder that runs regardless of role should still ask before
 * constructing an internal note.
 */
export function canViewNotes(c: GateContext): boolean {
  return c.role !== 'Client'
}

/**
 * Client card, Credit control: "Gated; the *block* itself is visible to
 * everyone who tries to book." The on-stop status (is this client blocked,
 * yes/no) is therefore never gated by this function — a caller includes it
 * unconditionally. Only the reason and who-set-it are staff information.
 */
export const canViewOnStopReason = canViewPII
