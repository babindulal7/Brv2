import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import type { Paisa } from '../../lib/money'

/**
 * # APPROVE_DAILY_CLOSING — signing off one branch-day
 *
 * `WHATSAPP_LINKS_SPEC v1.0` §5.4's approve, writing the row migration **0078**
 * created (applied 1 Sep 2026, `20260901114821`).
 *
 * ## The figures are passed in, and that is the point
 *
 * This action does not read the day's position. `lib/queries/closing.ts` does,
 * the screen renders exactly what it read, and the operator signs THAT. Having
 * the action re-read would mean the row could record a different day than the
 * one on screen when a payment landed between the render and the press — the
 * approver would have signed one statement and stored another. So the numbers
 * travel with the press, and Law 2 is satisfied upstream: the screen never
 * computed them either.
 *
 * The only figure this action derives is nothing at all. `variance` is passed
 * and 0078's CHECK re-derives it (`variance = counted_cash - expected_cash`),
 * so a client that got the arithmetic wrong is refused by Postgres rather than
 * quietly stored.
 *
 * ## The capability — `closing.approve`, mirrored not invented
 *
 * §4.20's ruled method: the RLS policy on the table this writes.
 * `daily_closings_finance_insert` (0078) is `auth_is_finance_or_admin()` —
 * Owner, Admin, Manager, Coordinator, Accounts — and `rbac.canApproveDailyClosing`
 * is that list. **PLAN.md §4.40(a) is open**: an Owner/Manager reading is
 * plausible, and if it is ruled the POLICY moves first.
 *
 * ## Branch comes from the approver's own row
 *
 * `daily_closings.branch_id` is NOT NULL and a closing is per branch. Unlike
 * `recordPayment`, which reads the branch off the invoice it settles, a closing
 * has no parent row to inherit from — so it is read from `users.branch_id`, the
 * approver's own operating branch. A user with no branch is refused by name
 * rather than defaulted to the first branch in the table, which would file one
 * branch's takings under another.
 */

export type ApproveDailyClosingInput = {
  /** The AD calendar day being closed, `YYYY-MM-DD`. */
  businessDate: string
  countedCash: Paisa
  expectedCash: Paisa
  variance: Paisa
  varianceReason?: string | undefined
  pickupsCount: number
  returnsCount: number
  newCount: number
  collectedCash: Paisa
  collectedBank: Paisa
  collectedCard: Paisa
  collectedOther: Paisa
  receivables: Paisa
  depositsHeld: Paisa
  /** **Law 8** — minted where the button was pressed, reused across retries. */
  clientUuid?: string | undefined
}

export type ApproveDailyClosingResult = {
  closingId: string
  businessDate: string
  approvedAt: string
}

export const approveDailyClosingConfig: ActionConfig<ApproveDailyClosingInput, ApproveDailyClosingResult> = {
  name: 'APPROVE_DAILY_CLOSING',
  permissions: ['closing.approve'],

  /** `true` — inserts into `daily_closings` and verifies the row Postgres kept. */
  implemented: true,

  validate: (input) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) {
      throw new Error('A closing names one day, written YYYY-MM-DD. Nothing was sent.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This closing carries no idempotency key, so a retry could not be told from a second press. Nothing was sent.',
      )
    }
    if (input.countedCash < 0 || input.expectedCash < 0) {
      throw new Error('A cash count may be zero, never negative. Nothing was sent.')
    }
    /* Re-checked here only so the operator gets a sentence instead of a
       constraint name; 0078's CHECK is the actual guarantee. */
    if (input.variance !== input.countedCash - input.expectedCash) {
      throw new Error(
        'The variance does not match the counted and expected figures it sits between, so the closing would contradict itself. Nothing was sent.',
      )
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. The closing was not queued — a signed record must not exist before the database has confirmed it.',
      )
    }

    /* ── the approver's branch ─────────────────────────────────────────────
       Read, not assumed. A closing filed under the wrong branch is worse than
       one not filed at all, because it silently moves a day's takings. */
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('branch_id')
      .eq('id', ctx.userId)
      .maybeSingle()

    if (userErr) {
      throw new Error(`The approver's branch could not be read, so nothing was signed: ${userErr.message}`)
    }
    const branchId = (userRow as { branch_id?: string | null } | null)?.branch_id
    if (!branchId) {
      throw new Error(
        'Your staff record carries no branch, and a closing is filed per branch. Nothing was signed — ask an Owner to set your branch first.',
      )
    }

    let inserted
    try {
      inserted = await idempotentInsert(
        'daily_closings' as never,
        {
          client_uuid: input.clientUuid,
          branch_id: branchId,
          business_date: input.businessDate,
          counted_cash: input.countedCash,
          expected_cash: input.expectedCash,
          variance: input.variance,
          variance_reason: input.varianceReason?.trim() || null,
          pickups_count: input.pickupsCount,
          returns_count: input.returnsCount,
          new_count: input.newCount,
          collected_cash: input.collectedCash,
          collected_bank: input.collectedBank,
          collected_card: input.collectedCard,
          collected_other: input.collectedOther,
          receivables: input.receivables,
          deposits_held: input.depositsHeld,
          approved_by: ctx.userId,
        } as never,
        /* Name the columns. 0078 revoked table-level SELECT and granted back
           only the non-money 13, so an unqualified RETURNING * would be denied
           on counted_cash and the write would LOOK like a failure while the row
           committed — the exact two-permissions trap InsertOptions documents
           against audit_events. Both columns below are inside the grant. */
        { returningColumns: 'id, approved_at' },
      )
    } catch (err) {
      throw new Error(translate(err, input.businessDate))
    }

    if (inserted.error) {
      throw new Error(translate(inserted.error, input.businessDate))
    }

    /* `idempotentInsert` echoes the payload back on its offline branch, so only
       a row carrying a server-minted `id` proves Postgres kept it. The offline
       branch is already refused above; this catches a mid-flight failure. */
    const persisted = inserted.data as unknown as { id?: string; approved_at?: string } | null
    if (!persisted || typeof persisted.id !== 'string') {
      throw new Error(
        'The closing was not confirmed as written, so the day is NOT signed off. Check the connection and try again.',
      )
    }

    return {
      result: {
        closingId: persisted.id,
        businessDate: input.businessDate,
        approvedAt: persisted.approved_at ?? new Date().toISOString(),
      },
      events: [
        {
          type: EVENT_TYPES.DAILY_CLOSING_APPROVED,
          payload: { closingId: persisted.id, businessDate: input.businessDate, userId: ctx.userId },
        },
      ],
    }
  },
}

/**
 * Postgres refusals a person can act on.
 *
 * Each maps a real 0078 guard. The fallback passes the message through rather
 * than replacing it with a generic sentence — an unrecognised database error is
 * information, and swallowing it is how "it didn't save" becomes unfixable.
 */
function translate(err: unknown, businessDate: string): string {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err)

  if (message.includes('daily_closings_one_live_per_branch_day') || message.includes('duplicate key')) {
    if (message.includes('client_uuid')) {
      return 'This closing was already recorded — the same press reached the database twice. Nothing was written a second time.'
    }
    return `${businessDate} is already closed for this branch. Void that closing before approving a corrected one.`
  }
  if (message.includes('daily_closings_variance_agrees')) {
    return 'The database refused the variance because it does not match the counted and expected figures. Nothing was signed.'
  }
  if (message.includes('daily_closings_counts_sane')) {
    return 'A figure in this closing is negative, which no count or total can be. Nothing was signed.'
  }
  if (message.includes('row-level security') || message.includes('42501')) {
    return 'Your role may not approve a closing. Nothing was signed.'
  }
  return `The closing was not saved: ${message}`
}

export const approveDailyClosing = createAction(approveDailyClosingConfig)
