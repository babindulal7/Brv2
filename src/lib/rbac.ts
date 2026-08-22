/**
 * RBAC Engine — Law 6 & Law 11
 *
 * Implements capability checks for the business 9 (Manager reopened 9 Aug
 * 2026 by Hover Intel System v2.1 — see the SystemRole doc comment):
 *   - Owner
 *   - Admin        (was also "the Ops Manager" until 9 Aug; now its own seat)
 *   - Manager      (grants mirror Admin everywhere unless a spec says otherwise)
 *   - Coordinator  (bookings, clients, takes the advance)
 *   - Warehouse    (STRICT ZERO-MONEY VISIBILITY)
 *   - Technician   (AC/prep — shares return triage; money-blind)
 *   - Accounts
 *   - Driver       (trips and delivery legs; money-blind)
 *   - Client       (EXTERNAL — portal only, never a staff surface)
 *
 * Every rule below mirrors a function in migration 0014/0018, so a capability
 * can never be granted in the UI and denied by RLS, or the reverse.
 *
 * Rule: Forbidden items are ABSENT from UI / Data, not merely disabled.
 */

import type { SystemRole } from '../types/database'

export type Role = SystemRole

export interface UserSession {
  id: string
  fullName: string
  email: string
  role: SystemRole
  branchId: string
  warehouseId: string | null
}

/** Law 6: Warehouse sees zero financial numbers anywhere in the application */
export function canViewMoney(role: SystemRole): boolean {
  return !MONEY_BLIND.has(role)
}

/**
 * Law 6, widened from Warehouse to the whole floor. A technician holding a
 * tablet in front of a client and a driver at the door are in the same position
 * the rule was written for. Mirrors `auth_can_view_money()` in 0014.
 */
const MONEY_BLIND: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
])

/** Client is external. Guard every staff surface with this. */
export function isStaff(role: SystemRole): boolean {
  return role !== 'Client'
}

/**
 * The booking desk and the floor: every role the database lets write a booking,
 * its lines, its client, or a stage transition.
 *
 * Read off the live project on 15 Aug 2026, where four separate policies carry
 * this identical array — `bookings_insert`, `booking_lines_all`,
 * `clients_insert` and `booking_stage_transitions_insert`. It is named once here
 * for the same reason `MONEY_BLIND` is: a set repeated at four call sites drifts
 * at one of them.
 *
 * Note who is NOT in it — **Technician**, who `canPerformOperations` does admit.
 * The two sets are genuinely different jobs: a technician may pack and reset the
 * gear on a booking they cannot create or commit.
 */
const BOOKING_DESK: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
])

/**
 * The floor. `BOOKING_DESK` minus Coordinator.
 *
 * Mirrors the live write policy shared by `operation_sessions`, `stock_audits`,
 * `stock_transfers`, `maintenance_records` and `evidence_files` (read off
 * `pg_policies` on 16 Aug 2026): Owner, Admin, Manager, Warehouse. Coordinator
 * is absent from every one of them — taking a booking is desk work, moving the
 * gear is not.
 *
 * ⚠ Not the same set as `canPerformOperations`, which also admits Technician.
 * That function governs *working* a session someone else opened; this one
 * governs writing the session row. Do not collapse them without a ruling.
 */
const FLOOR: ReadonlySet<SystemRole> = new Set<SystemRole>(['Owner', 'Admin', 'Manager', 'Warehouse'])

/**
 * Back office. Mirrors `client_merges_all` and `suppliers_all` (live, 16 Aug
 * 2026): Owner, Admin, Manager. Narrower than the desk because these acts are
 * irreversible or contractual.
 */
const BACK_OFFICE: ReadonlySet<SystemRole> = new Set<SystemRole>(['Owner', 'Admin', 'Manager'])

/**
 * Check if role can confirm a rental — the Quote → Booked commitment.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing PLAN.md §4.20. This
 * was the last of four capabilities that `actions/core.ts:checkCapability` did
 * not resolve, which the dispatcher read as a denial for *every* role, Owner
 * included: Confirm Rental was permission-denied rather than unbuilt, with a
 * real body behind it.
 *
 * The role set is not invented here. `confirmRental` writes exactly one row, to
 * `booking_stage_transitions`, and that table's INSERT policy (live, 15 Aug)
 * already states who may:
 *
 *     with check (
 *       auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])
 *       and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
 *     )
 *
 * `confirmRental.ts`'s own header argued this exact set and refused to borrow
 * `operations.perform` for it, because that one admits Technician and excludes
 * Coordinator — the booking desk, the seat whose job this is.
 *
 * ⚠ The policy's second clause — the actor must BE the session — is not mirrored
 * here and deliberately so. This function answers "may this role", a question
 * about rank; identity is enforced at the row by RLS, where it cannot be talked
 * past. `lib/bookingTransition` passes `ctx.userId` as `actor_id`.
 *
 * No offline degradation: a stage move is not a money action, and
 * `confirmRental.execute` already refuses offline outright with its own reason
 * (a queued transition is checked against the stage at drain time, which may be
 * hours later). Adding a second, quieter offline rule here would duplicate that.
 */
export function canConfirmRental(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/**
 * Check if role can create a client.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing PLAN.md §4.20.
 * `createClient` inserts into `clients`, whose live INSERT policy is
 * `clients_insert`: Owner, Admin, Manager, Coordinator, Warehouse. Coordinator
 * is in it because taking a walk-in's details is the booking desk's work.
 */
export function canCreateClient(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/**
 * Check if role can block a client.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing PLAN.md §4.20.
 * Narrower than `canCreateClient` — Owner, Admin, Manager — and the database
 * draws that line itself. `client_flags_insert` (live) splits on the flag:
 *
 *     ((flag_type =  'Blocked' and auth_user_role() = any (array['Owner','Admin','Manager']))
 *   or (flag_type <> 'Blocked' and auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])))
 *
 * So Coordinator and Warehouse may raise any other flag on a client and may not
 * raise this one. `blockClient` writes `flag_type = 'Blocked'`, so it takes the
 * narrow branch. A capability named for the general act of flagging would be
 * wrong here; this one is named for the block specifically.
 */
export function canBlockClient(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can create a bundle.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing the fourth gap —
 * `inventory.create` — which PLAN.md §4.20 did not name and no document had
 * logged before 15 Aug.
 *
 * `createBundle` writes two tables and their policies disagree:
 *
 *   - `bundles_manage`    — Owner, Admin, Manager
 *   - `bundle_items_all`  — Owner, Admin, Manager, **Warehouse**
 *
 * The intersection is what the action can actually complete, so it is what this
 * returns. Warehouse may add items to a bundle that exists and may not create
 * one; granting `inventory.create` to Warehouse would pass this check and then
 * fail at the first insert, which is the failure shape Law 6's UI rule exists to
 * prevent — forbidden is absent, not attempted and refused.
 */
export function canCreateBundle(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/* ────────────────────────────────────────────────────────────────────────────
 * The remaining capability rules — ruled 16 Aug 2026, same method as the four
 * above. Derivation table: `CAPABILITY_MAPPING_2026-08-16.md` §4.
 *
 * One predicate per **role set**, not per capability. Twenty-one near-identical
 * functions would hide the fact that four rules do all the work, and each of the
 * four is a table's policy rather than a product opinion.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Booking-desk writes: `bookings`, `booking_lines`, `clients`,
 * `inventory_reservations`, `document_registry`.
 *
 * Mirrors `bookings_insert` / `booking_lines_all` / `clients_update` (live,
 * 16 Aug 2026) — the same array `BOOKING_DESK` was named for.
 *
 * Covers `rental.create`, `rental.draft`, `rental.cancel`, `rental.extend`,
 * `client.update`, `inventory.reserve`, `document.create` and
 * `subrental.create`. The last has no table of its own: a sub-rental is a
 * `booking_lines` row with `line_type = 'Sub-rental'`, carrying `supplier_id`,
 * `supplier_cost` and `markup_amount`, so it mirrors `booking_lines_all`.
 * Creating a **supplier** is a different act on `suppliers`, which is
 * `canWriteBackOffice` — a sub-rental flow that creates suppliers inline needs
 * both.
 */
export function canWriteBookingDesk(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/**
 * Floor writes: `operation_sessions`, `stock_audits`, `stock_transfers`,
 * `maintenance_records`, `evidence_files`. Mirrors `operation_sessions_all`.
 *
 * Covers `rental.pickup`, `rental.return`, `inventory.pack`, `inventory.ready`,
 * `inventory.audit`, `inventory.transfer`, `maintenance.create`,
 * `maintenance.complete` and `evidence.review`.
 */
export function canWriteFloor(role: SystemRole): boolean {
  return FLOOR.has(role)
}

/**
 * Irreversible client-record acts. Mirrors `client_merges_all`.
 *
 * Deliberately narrower than `canWriteBookingDesk`: both touch clients, but
 * `client_merges_all` is Owner/Admin/Manager while `clients_update` is the desk
 * five. Merging cannot be undone in the way editing can, and the database
 * already draws that line — this only repeats it.
 */
export function canMergeClients(role: SystemRole): boolean {
  return BACK_OFFICE.has(role)
}

/**
 * Shared-triage surfaces: `cases`, `crew_assignments`, `purchase_requests`
 * (raising, editing, submitting, cancelling, and post-approval legwork).
 * Mirrors `auth_is_staff()` — every staff role, Client excluded.
 *
 * `purchase.approve` no longer lives here. It did until 23 Aug 2026, when
 * migration 0064 (`purchase_requests_approval_rank`, RESTRICTIVE) went live on
 * the project and the verb moved to `canApprovePurchase` below, per the
 * mirror rule this file works by. 0064 deliberately left everything else on
 * `purchase_requests_all` = `auth_is_staff()`, which is what this predicate
 * continues to mirror for the non-deciding verbs. History: PLAN.md §4.29.
 */
export function canWriteSharedTriage(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Deciding a purchase request — landing it on Approved or Rejected.
 *
 * Mirrors `purchase_requests_approval_rank` (0064, applied 23 Aug 2026): a
 * RESTRICTIVE UPDATE policy gating any update whose RESULTING row is Approved
 * or Rejected on `auth_is_finance_or_admin()` — Owner, Admin, Manager,
 * Coordinator, Accounts (0018:20). Exactly `auth_is_staff()` minus the three
 * money-blind staff roles: the tier that can READ the costs is the tier that
 * may authorise them (Law 6 coherence — the incoherence this fixes was a
 * Driver approving spend it could not see).
 *
 * Rejected is gated alongside Approved because refusing spend is deciding
 * spend, and the enum allows Rejected from Approved — an ungated Reject would
 * let a money-blind role revoke a finance decision.
 */
export function canApprovePurchase(role: SystemRole): boolean {
  return (
    role === 'Owner' ||
    role === 'Admin' ||
    role === 'Manager' ||
    role === 'Coordinator' ||
    role === 'Accounts'
  )
}

/**
 * Check if user can approve a given discount percentage.
 *
 * ⚠ **`percent < 0` is refused, and this used to grant it to everyone.** The
 * guard read `if (percent <= 0) return true`, which sits *above* every role
 * check — so `canApproveDiscount('Client', -5)` returned **true**, as did the
 * offline-adjacent path for any role. Fixed 16 Aug 2026 (`R3-1`, PLAN.md §4.35).
 *
 * Zero still needs no approval — there is nothing to approve. A NEGATIVE percent
 * is not a small discount, it is a **price increase**, and nothing in this
 * product may raise a price through the discount path. This is not a new rule:
 * `lib/discount.ts:validateDiscount` already rejects it and so does the database
 * (`booking_discounts_hard_cap`, `0002_bookings.sql`). This function and
 * `money.ts:discountGate` were the two that disagreed.
 */
export function canApproveDiscount(role: SystemRole, percent: number, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  if (percent < 0) return false // A negative discount is a price rise. Never approvable.
  if (percent === 0) return true // Nothing to approve.
  if (percent > 25) return false // 25% hard cap (Law 10)
  if (role === 'Owner') return true
  if ((role === 'Admin' || role === 'Manager') && percent <= 15) return true
  return false
}

/** Check if role can void an invoice */
export function canVoidInvoice(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Accounts'
}

/** Check if role can manage operations sessions (pack, handover, return, reset) */
export function canPerformOperations(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Warehouse' || role === 'Technician'
}

/** Check if role can record payments or security deposits */
export function canRecordPayment(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Coordinator' || role === 'Accounts'
}

/** Check if role can override client credit limits */
export function canOverrideCreditLimit(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can sign off a damage charge at the level the engine requires.
 *
 * **Ruled 12 Aug 2026: Owner and Manager only.** Previously this rule did not
 * exist here at all — `DamageTab.tsx` computed it inline as
 * `approver === 'Owner' ? role === 'Owner' : role === 'Owner' || role === 'Admin' || role === 'Manager'`,
 * which put a business rule in a page (against Law 1) and quietly granted damage
 * sign-off to **Admin**, a role the ruling excludes.
 *
 * The database does not settle this: RLS on `damage_findings` is a single
 * `auth_is_staff()` policy, and its only relevant CHECK
 * (`damage_findings_approved_needs_approver`) requires an approver be *named*,
 * not that they hold any particular rank. So this is the app's rule to state,
 * and an RLS predicate mirroring it is the natural follow-up.
 *
 * `requiredApprover` comes from `lib/damage`'s `approverFor(chargePaisa)` — the
 * Rs 25,000 banding lives there and is NOT duplicated here. This function
 * answers only "may this role act at that level", which keeps the threshold in
 * one place and the role rule in the other. That split is deliberate: importing
 * the threshold into `rbac` would let a later change to one silently re-rule the
 * other, which is exactly the trap `canOverrideCreditLimit` sets if it is
 * borrowed for this.
 */
export function canApproveDamage(role: SystemRole, requiredApprover: 'Manager' | 'Owner'): boolean {
  if (requiredApprover === 'Owner') return role === 'Owner'
  return role === 'Owner' || role === 'Manager'
}

/**
 * Check if role can approve a late-fee waiver.
 *
 * **Not a new ruling** — `lib/lateFee.ts:26` already states it: "Any staff member
 * may raise a waiver; a Manager or Owner must approve it." This function is that
 * sentence made enforceable. There is deliberately **no threshold**, matching
 * `WAIVER_NEEDS_APPROVER = true`: unlike a discount, every waiver needs an
 * approver regardless of size, because waiving is giving money away and the
 * direction — not the amount — is what makes it an approval.
 *
 * Distinct from `canApproveDiscount`, which is percentage-banded, and from
 * `canApproveDamage`, which bands at Rs 25,000. Three money approvals, three
 * different shapes, each stated where it is ruled.
 *
 * ⚠ This governs the SESSION performing the approval. `LateFeePanel` separately
 * collects `approverName` as free-typed text, and `validateWaiver` checks only
 * that it is non-empty — so a typed name is not an authenticated approver.
 * TODO(decision): whether the typed approver field should be replaced by the
 * session's own identity, or kept as a second countersignature alongside it.
 */
export function canApproveLateFeeWaiver(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Manager'
}

/** Check if role can manage users and system configuration */
export function canManageSettings(role: SystemRole): boolean {
  return role === 'Owner'
}
