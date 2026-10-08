import { supabase } from '../supabase'

/**
 * # The signed-in user's branch
 *
 * `bookings.branch_id` is `not null` (`0002_bookings.sql:25`) and the session
 * object the app carries — `AuthUser` in `lib/auth.tsx` — has three fields and
 * a flag, none of them a branch. So the one thing a booking cannot be written
 * without is the one thing the session does not know.
 *
 * The owner's ruling (New Rental persistence, §27.3 / owner decisions): resolve
 * it from the signed-in user's own staff row, `users.branch_id`
 * (`0007_admin_security.sql:112`, `not null` — verified against the local
 * container 25 Aug 2026). No branch selector until multi-branch desks are real;
 * a picker that always has one option is a question with one answer.
 *
 * ## Why this is a read and not a guess
 *
 * The alternative shapes were "take the first row of `branches`" and "carry a
 * default in Settings". Both would write a booking to a branch nobody chose,
 * and `branch_id` is what every branch-scoped RLS predicate and every branch
 * report reads afterwards. A wrong branch is not a cosmetic defect: it moves
 * a booking out of the sight of the desk that made it.
 *
 * ## Failure is refusal, never a fallback
 *
 * A read that fails, or a staff row that cannot be seen, resolves to `null` and
 * the caller refuses the write with the reason. There is deliberately no
 * "default branch": a booking attributed to the wrong branch is worse than a
 * booking not created, because only one of the two is visible as a problem.
 *
 * `users_self_read` (0059) is what makes this readable by every role for their
 * own row.
 */
export async function getSessionBranchId(userId: string): Promise<string | null> {
  if (!userId.trim()) return null

  const { data, error } = await supabase
    .from('users')
    .select('branch_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Your branch could not be read from your staff record, so a booking cannot be attributed to a branch: ` +
        `${error.message}`,
    )
  }

  const row = data as unknown as { branch_id?: string | null } | null
  const branchId = row?.branch_id
  return typeof branchId === 'string' && branchId.length > 0 ? branchId : null
}
