import { useAuth } from './auth'
import type { Role as SessionRole } from './auth'
import { canViewMoney } from './rbac'
import type { SystemRole } from '../types/database'

/**
 * Foundation §8.3 / CLAUDE.md — **Warehouse sees no money, anywhere.**
 *
 * The session (`lib/auth`) carries eight role names; the RBAC engine
 * (`lib/rbac`) is defined over the six canonical `SystemRole`s. This map exists
 * for exactly one question — *may this session see a rupee figure* — and is
 * deliberately restrictive: a role the engine does not know falls into the
 * zero-money bucket, because showing money to someone who should not see it is
 * the unrecoverable direction of that mistake.
 *
 * TODO(decision) — PLAN.md §4: Coordinator, Technician, Driver and Client are
 * not among the six canonical roles. Either fold them into the six or extend
 * `SystemRole`; until then they are treated as money-blind.
 */
const MONEY_ROLE: Record<SessionRole, SystemRole> = {
  Owner: 'Owner',
  Manager: 'Manager',
  Accounts: 'Accounts',
  Warehouse: 'Warehouse',
  Coordinator: 'Warehouse',
  Technician: 'Warehouse',
  Driver: 'Warehouse',
  Client: 'Warehouse',
}

/**
 * True when the signed-in session may see money at all. Call sites must use it
 * to **omit** the figure — the card, the column, the field — never to mask it.
 */
export function useCanViewMoney(): boolean {
  const { user } = useAuth()
  return user ? canViewMoney(MONEY_ROLE[user.role]) : false
}
