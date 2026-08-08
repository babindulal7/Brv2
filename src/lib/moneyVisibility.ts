import { useAuth } from './auth'
import { canViewMoney } from './rbac'

/**
 * Foundation §8.3 / CLAUDE.md — **the floor sees no money, anywhere.**
 *
 * This file used to carry a `MONEY_ROLE` map collapsing Coordinator, Technician,
 * Driver and Client onto Warehouse, because the session knew eight role names and
 * the RBAC engine only knew six. Its own TODO(decision) asked for that to be
 * settled by either folding the four in or extending `SystemRole`.
 *
 * Ruled 8 Aug 2026: `SystemRole` is the business 8. The two vocabularies are now
 * one, so the map is gone — a lossy translation between them cannot go stale if
 * it does not exist. `canViewMoney` in `lib/rbac` is the single rule, mirroring
 * `auth_can_view_money()` in migration 0014 so the UI and RLS cannot disagree.
 */

/**
 * True when the signed-in session may see money at all. Call sites must use it
 * to **omit** the figure — the card, the column, the field — never to mask it.
 *
 * No session is money-blind: an unidentified user is not shown rupees.
 */
export function useCanViewMoney(): boolean {
  const { user } = useAuth()
  return user ? canViewMoney(user.role) : false
}
