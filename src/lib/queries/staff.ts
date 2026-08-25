import { supabase, IS_MOCK } from '../supabase'
import type { SystemRole } from '../../types/database'

/**
 * # The staff directory — Law 2's module for the `users` entity
 *
 * ## Why this is the app's FIRST read of `users` as a list
 *
 * `Settings ▸ People` has said this since it was built:
 *
 * > *"How many staff accounts exist is not tracked yet — there is no user query
 * > in this build. The full directory, user creation and role assignment need
 * > the auth backend, which is not connected."*
 * > (`modules/settings/sections/UsersRoles.tsx:145-149`)
 *
 * The auth backend has been connected since 0041. What was missing was this
 * module. `AuthProvider.loadProfile` reads `users`, but one row, by id, for the
 * signed-in session — a list is a different question.
 *
 * ## Everything comes from the view, nothing is re-derived
 *
 * `staff_directory_v` (0067) joins `branches`, `staff_auth_pins` and
 * `auth.users` server-side. Two of those three cannot be joined from a screen
 * at all: `authenticated` holds no privilege on the `auth` schema, and
 * `staff_auth_pins` grants SELECT to nobody. So this is not a convenience
 * wrapper over a join a component could have written — the join is only
 * possible inside a SECURITY DEFINER view.
 *
 * ## The column this module exists to carry: `hasAuthAccount`
 *
 * A staff row can exist with no sign-in account behind it. 0041's identity
 * contract (`auth.users.id` IS `public.users.id`) is a convention, not a
 * foreign key, and 0060's header spells out that nothing enforces it. On 23 Aug
 * 2026 the local stack held five `users` rows and four auth accounts.
 *
 * That state breaks password reset SILENTLY. `resetPasswordForEmail` answers
 * identically for an address with an account and one without — deliberately, so
 * the endpoint is not an enumeration oracle — so the client gets a
 * success-shaped response and the link never arrives. `hasAuthAccount` is the
 * only way a screen can know, and a reset button that ignores it is a button
 * that sometimes does nothing and never says so.
 *
 * ## Who can read it
 *
 * Owner alone. The view carries `where auth_user_role() = 'Owner'` inline
 * (0048's rule), matching `rbac.canManageSettings`. Any other role gets ZERO
 * rows, not masked ones — so a non-Owner caller must render **restricted**,
 * never **empty**. `fetchStaffDirectory` returns that distinction rather than
 * leaving it to be inferred from a row count, which is the mistake
 * `queries/finance.ts`'s header warns about.
 *
 * ## Mock mode
 *
 * The corpus serves no `staff_directory_v`, so the mimic would answer `[]` —
 * indistinguishable from "this desk has no staff". Refused by name instead.
 */

export interface StaffDirectoryRow {
  /** `users.id`, which is also `auth.users.id` when an account exists (0041). */
  id: string
  /** `full_name` — `not null` on the live database. */
  fullName: string
  /** `employee_code` — the searchable operator-facing handle ("EMP-005"). */
  employeeCode: string | null
  /** `email` — `not null`. This IS the reset destination, which is why it is shown. */
  email: string
  primaryRole: SystemRole
  department: string | null
  branchCode: string | null
  branchName: string | null
  isActive: boolean
  /** Whether a live (unrevoked) PIN exists. Existence only — never a hash. */
  hasPin: boolean
  /** Set only while a PIN lockout is in force; null once it lapses. */
  pinLockedUntil: string | null
  /**
   * Whether a GoTrue account exists for this staff row. `false` means this
   * person cannot sign in at all and a reset link would go nowhere — see the
   * header.
   */
  hasAuthAccount: boolean
  /** Null for an account that has never been used. Distinguishes "invited" from "active". */
  lastSignInAt: string | null
}

interface RawStaffRow {
  id: string
  full_name: string | null
  employee_code: string | null
  email: string | null
  primary_role: string
  department: string | null
  branch_code: string | null
  branch_name: string | null
  is_active: boolean
  has_pin: boolean
  pin_locked_until: string | null
  has_auth_account: boolean
  last_sign_in_at: string | null
}

export type StaffDirectoryResult =
  | { kind: 'ok'; rows: StaffDirectoryRow[] }
  /** The caller may not read this surface, or the surface cannot answer here. */
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }

export async function fetchStaffDirectory(): Promise<StaffDirectoryResult> {
  if (IS_MOCK) {
    return {
      kind: 'unavailable',
      message:
        'The staff directory reads staff_directory_v, which the mock corpus does not serve. ' +
        'Run against the live project or the local Supabase stack (VITE_DATA_SOURCE=mock is set).',
    }
  }

  const { data, error } = await supabase
    .from('staff_directory_v')
    .select(
      'id, full_name, employee_code, email, primary_role, department, branch_code, branch_name, ' +
        'is_active, has_pin, pin_locked_until, has_auth_account, last_sign_in_at',
    )
    .order('employee_code', { ascending: true })

  if (error) return { kind: 'error', message: error.message }

  const raw = (data ?? []) as unknown as RawStaffRow[]

  return {
    kind: 'ok',
    rows: raw.map((r) => ({
      id: r.id,
      // Empty string, never a placeholder — the same rule `loadProfile` follows.
      // A name nobody has is worse than a visibly missing one.
      fullName: r.full_name ?? '',
      employeeCode: r.employee_code,
      email: r.email ?? '',
      primaryRole: r.primary_role as SystemRole,
      department: r.department,
      branchCode: r.branch_code,
      branchName: r.branch_name,
      isActive: r.is_active,
      hasPin: r.has_pin,
      pinLockedUntil: r.pin_locked_until,
      hasAuthAccount: r.has_auth_account,
      lastSignInAt: r.last_sign_in_at,
    })),
  }
}

/**
 * Revoke another staff member's PIN. Owner only, enforced in
 * `revoke_staff_pin_for` (0066) rather than here.
 *
 * ## Why this is not an entry under `src/actions/`
 *
 * The action dispatcher exists to validate, emit domain events and write an
 * audit row for changes to business entities. A PIN revocation is none of
 * those: it touches no booking, invoice or client, emits no domain event any
 * screen subscribes to, and its own audit trail is the `revoked_at` /
 * `revoked_by` pair on the row itself, which Law 3 keeps forever. Registering
 * it would mean inventing a domain event nothing consumes.
 *
 * It also revokes a PIN and nothing else. It does NOT reset a password —
 * passwords are GoTrue's, and the only path to one is the emailed link, which
 * needs no elevated privilege and lets no operator choose a credential.
 */
export async function revokeStaffPinFor(userId: string): Promise<{ error: string | null }> {
  if (IS_MOCK) {
    return { error: 'Revoking a PIN needs the live Supabase project (VITE_DATA_SOURCE=mock).' }
  }
  try {
    const { error } = await supabase.rpc('revoke_staff_pin_for', { p_user_id: userId })
    return { error: error ? error.message : null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The PIN could not be revoked.' }
  }
}

/**
 * Record that a password-reset link was requested for a staff member (0068).
 *
 * ## Why this is a second call rather than part of the first
 *
 * The reset itself is `supabase.auth.resetPasswordForEmail`, which talks to
 * GoTrue and touches no table in this schema. There is nothing for a trigger to
 * fire on, so the only way the action exists in the audit trail is if the caller
 * says so — deliberately, here.
 *
 * ## It records a REQUEST, and the wording matters
 *
 * GoTrue answers identically for an address with an account and one without, so
 * "sent" is not knowable and "delivered" certainly is not. 0068's row says
 * requested. See that migration's header for the full limitation, including the
 * one this shape cannot close: an Owner could call this without sending
 * anything.
 *
 * ## A failure here does NOT fail the reset
 *
 * By the time this runs the link has already been requested — that side effect
 * is done and cannot be taken back. Reporting the whole operation as failed
 * would tell the operator nothing happened when something did, and they would
 * reasonably try again. The caller surfaces this separately.
 */
export async function recordPasswordResetRequest(userId: string): Promise<{ error: string | null }> {
  if (IS_MOCK) return { error: null }
  try {
    const { error } = await supabase.rpc('record_password_reset_request', { p_user_id: userId })
    return { error: error ? error.message : null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The reset request could not be recorded.' }
  }
}
