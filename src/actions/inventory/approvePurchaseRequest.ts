import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { safeUpdate } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/audit'

/**
 * # APPROVE_PURCHASE_REQUEST — the write
 *
 * ## What this replaced
 *
 * ```ts
 * console.log(`[DB TX] Purchase Request ${input.prId} updated to ${input.status}`)
 * return { result: { success: true }, events }
 * ```
 *
 * A `console.log` that "approved" spend without touching a row. This file is
 * now the UPDATE: resolve the PR by its number, check the move is legal, and
 * write `status` (+ `approved_by`) through `lib/dataAccess.safeUpdate` under
 * the caller's Law 8 action key.
 *
 * ## Schema facts this body is built on (0004_inventory.sql:578-604)
 *
 * 1. The natural key is `pr_no` (unique). The screen's rows are a seed array
 *    whose `id`s (`pr-001`) are not uuids and exist in no database, so the
 *    input takes the PR NUMBER and resolves it by SELECT — the same
 *    natural-key-to-uuid rule every implemented action follows. A number the
 *    database does not hold is refused with a sentence saying exactly that;
 *    on today's seed-only screen that refusal IS the honest outcome
 *    (`docs/pages/20_purchase_requests.md` §3: no code reads the real table).
 * 2. Forward-only, from the enum's own comment (0001:633): Approved and
 *    Rejected are reachable from `Submitted`, Rejected also from `Approved`;
 *    Ordered only from `Approved`. The current status is read first and an
 *    illegal move is refused by name — a decision recorded over a stale row
 *    is a different decision than the operator made.
 * 3. `approved_by` is written on Approved — the session's own id, never a
 *    typed name. `rejection_reason` exists (and 0001 carries a
 *    purchase_request_rejection_reason enum) but this screen collects no
 *    reason; the column is left NULL rather than invented. TODO(decision):
 *    a Reject dialog that collects the ruled reasons.
 *
 * ## Permission — the finance/admin five (0064, applied 23 Aug 2026)
 *
 * `purchase.approve` → `rbac.canApprovePurchase` — Owner, Admin, Manager,
 * Coordinator, Accounts — mirroring `purchase_requests_approval_rank`
 * (0064, RESTRICTIVE): any UPDATE whose resulting row is Approved or Rejected
 * requires `auth_is_finance_or_admin()`. The §4.29 breadth (Driver/Technician
 * admitted to a spend-authorising verb via `purchase_requests_all`) is closed;
 * raising, editing, submitting, cancelling, and Ordered/Received legwork stay
 * on the broad policy and are not this action's business.
 *
 * ## Offline
 *
 * Refused, not queued: `safeUpdate`'s offline branch returns an optimistic
 * echo of the payload, and the screen moves the row only on the resolved
 * path — a queued approval would show a decision procurement never received.
 * Money-adjacent approvals refuse offline throughout `lib/rbac`; this verb
 * authorises spend and follows them.
 *
 * ## Audit
 *
 * `purchase_requests` has no audit trigger (0010 covers six tables), so the
 * decision is logged through `lib/audit` with the old and new status; failure
 * is reported and the verb proceeds (§4.36, still open).
 *
 * ## How the write was driven
 *
 * Driven through the exported `approvePurchaseRequestConfig` in vitest with
 * `lib/dataAccess` and `lib/supabase` mocked at the same seams
 * `createClient`'s suite uses (`__tests__/inventoryWrites.test.ts`); the
 * staff/Client denial is pinned separately through the dispatched action.
 * Not driven against live Supabase — this session may not run the dev server
 * or apply migrations, and the live table holds no rows for the seed PR
 * numbers, so a live drive today ends at the named not-found refusal by
 * design.
 */

export type PurchaseRequestDecision = 'Approved' | 'Rejected' | 'Ordered'

export type ApprovePurchaseRequestInput = {
  /** `purchase_requests.pr_no` — the identifier the operator is looking at. */
  prNo: string
  decision: PurchaseRequestDecision
  /** Law 8 — the action key for this one decision, minted where the operator pressed the button. */
  clientUuid: string
}

export type ApprovePurchaseRequestResult = {
  /** `purchase_requests.id` — the row's uuid. */
  prId: string
  prNo: string
  status: PurchaseRequestDecision
}

/** Legal moves, from the `purchase_request_status` enum's own comment (0001:633). */
const ALLOWED_FROM: Record<PurchaseRequestDecision, readonly string[]> = {
  Approved: ['Submitted'],
  Rejected: ['Submitted', 'Approved'],
  Ordered: ['Approved'],
}

export const approvePurchaseRequestConfig: ActionConfig<ApprovePurchaseRequestInput, ApprovePurchaseRequestResult> = {
  name: 'APPROVE_PURCHASE_REQUEST',
  permissions: ['purchase.approve'],

  /** `true` because `execute` updates through `lib/dataAccess.safeUpdate` and
   *  verifies the row came back from the store. See the header for how it was driven. */
  implemented: true,

  validate: (input) => {
    if (!input.prNo || input.prNo.trim() === '') {
      throw new Error('Purchase Request number is required.')
    }
    if (input.decision !== 'Approved' && input.decision !== 'Rejected' && input.decision !== 'Ordered') {
      throw new Error(`"${String(input.decision)}" is not a decision this action records — Approve, Reject or Mark as Ordered.`)
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This decision carries no idempotency key, so a replay could record it twice under two audit rows. ' +
          'Nothing was sent. (Law 8)',
      )
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /* OFFLINE — refused, not queued. See the header. */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. A purchase decision is not queued for later — the request may have moved ' +
          'by the time the queue drains, and the decision would land on a state nobody looked at. Decide ' +
          'when you are back online.',
      )
    }

    const prNo = input.prNo.trim()
    const { data: prRow, error: prError } = await supabase
      .from('purchase_requests')
      .select('id, pr_no, status')
      .eq('pr_no', prNo)
      .maybeSingle()
    if (prError) {
      throw new Error(`Could not look up ${prNo}, so nothing was decided: ${prError.message}`)
    }
    if (!prRow) {
      throw new Error(
        `${prNo} does not exist in the database, so nothing was decided. This screen's register is seed ` +
          `data (docs/pages/20_purchase_requests.md) — until a PR intake writes real rows, there is nothing ` +
          `here for a decision to land on.`,
      )
    }
    const pr = prRow as { id: string; pr_no: string; status: string }

    const allowedFrom = ALLOWED_FROM[input.decision]
    if (!allowedFrom.includes(pr.status)) {
      throw new Error(
        `${pr.pr_no} is ${pr.status}, and ${input.decision} is only reachable from ${allowedFrom.join(' or ')} ` +
          `(purchase_request_status is forward-only, 0001:633). Nothing was changed — reload the list and ` +
          `decide on the request's real state.`,
      )
    }

    const patch: Record<string, unknown> = {
      status: input.decision,
      updated_by: ctx.userId,
      /* approved_by carries the session that APPROVED — never set on Reject or
         on the later Ordered move, which keeps the approver's identity intact. */
      ...(input.decision === 'Approved' ? { approved_by: ctx.userId } : {}),
      /* rejection_reason stays NULL — this screen collects none. See the header. */
    }

    /* `as never` — the sanctioned cast from createClient.ts:389-405: the
       hand-written `Database` type has no `purchase_requests` entry. */
    const updateResult = await safeUpdate('purchase_requests' as never, pr.id, patch as never, input.clientUuid)

    /* PERSISTENCE CHECK — safeUpdate's network branch returns the SENT patch
       plus `id`, which carries no `pr_no`; only a row read back from the store
       does. An echo is treated as not-saved, never as success. */
    const persisted = updateResult.data as unknown as { id?: string; pr_no?: string; status?: string } | null
    if (updateResult.error) {
      throw new Error(
        `The decision could not be confirmed against the database, so treat it as not recorded: ${
          (updateResult.error as { message?: string }).message ?? String(updateResult.error)
        }`,
      )
    }
    if (!persisted || typeof persisted.pr_no !== 'string' || persisted.status !== input.decision) {
      throw new Error(
        'The decision was queued rather than written — the database has not confirmed it. Check the ' +
          'connection and decide again; the same decision replayed carries the same key (Law 8).',
      )
    }

    /* No audit trigger on purchase_requests (0010) — a spend authorisation is
       logged here, old state and new. Failure reported, verb proceeds (§4.36). */
    const audit = await logAuditEvent({
      eventClass: 'status change',
      category: 'Inventory',
      module: 'Inventory',
      action: input.decision === 'Approved' ? 'Approve' : input.decision === 'Rejected' ? 'Reject' : 'Update',
      tableName: 'purchase_requests',
      recordId: pr.id,
      actorId: ctx.userId,
      actorRole: ctx.role,
      oldValues: { status: pr.status },
      newValues: { status: input.decision },
    })
    if (!audit.ok) {
      console.error('[APPROVE_PURCHASE_REQUEST] audit write failed (verb proceeded, §4.36):', audit.error)
    }

    const events = [
      {
        type: EVENT_TYPES.PURCHASE_REQUEST_UPDATED,
        payload: {
          prId: pr.id,
          prNo: pr.pr_no,
          status: input.decision,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        prId: pr.id,
        prNo: pr.pr_no,
        status: input.decision,
      },
      events,
    }
  },
}

export const approvePurchaseRequest = createAction(approvePurchaseRequestConfig)
