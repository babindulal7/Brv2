/**
 * **Status Transition Executor — Foundation Specification v2.0 §1.2 / §1.7 / §1.9.**
 *
 * `workflow.ts` could answer "is this move legal?" and nothing asked it:
 * `canAdvance` had zero callers outside `src/lib`, and the only two mentions
 * anywhere were comments *stating* it is not called (`src/data/bookingIntel.ts`,
 * `src/modules/rentals/ResetWorkspace.tsx`). This file is the missing other
 * half — the one place a status change is *applied*.
 *
 * Law 1: the rule lives in the engine, the row lives here. This module
 * evaluates nothing itself; it calls `planTransition()` and refuses or writes.
 *
 * **Why it writes `booking_stage_transitions` and never `bookings.stage`.**
 * `0002_bookings.sql:80-81` — "Read model of booking_stage_transitions. Written
 * ONLY by that table's trigger; a direct UPDATE is rejected." So the append-only
 * insert *is* the stage change. That also makes law 3 free: a wrong transition is
 * corrected by a reversal row, never by editing history.
 *
 * **Law 8.** `clientUuid` is the caller's action key, minted at the point the
 * user acted (`newClientUuid()` in `./supabase`), and carries the table's
 * `unique (client_uuid)` constraint (`0002:444`) whose own comment is exactly
 * this case: "A double-submitted Confirm may not advance two stages."
 *
 * **Not in scope, deliberately:**
 *  - *Reversals.* §1.2 makes a reversal a Manager-approved audited exception,
 *    and `0002:447-452` requires approver + reason + `audit_event_id` together.
 *    `is_reversal` is hardcoded `false` here; a reversal needs its own approval
 *    path, not an extra boolean on this one.
 *  - *The Booqable push.* `booqable/sync.ts` §11's `pushOrderReserve` /
 *    `pushOrderStart` / `pushOrderStop` are the write-back for the same three
 *    advances, and each takes a sign-off boolean this module cannot derive. Whether
 *    an OS-initiated advance must also enqueue the outbox is unruled — PLAN.md §4.16.
 *    Callers that need it call the push function themselves, as they do today.
 */

import { idempotentInsert } from './dataAccess'
import { logAuditEvent } from './audit'
import { planTransition, type BookingStatus, type CloseGateInput, type Flag, type TransitionPlan } from './workflow'
import type { SystemRole } from '../types/database'

export interface BookingTransitionRequest {
  bookingId: string
  /**
   * Denormalised onto the transition row (`0002:466`) so RLS and the reporting
   * indexes do not need a join on an append-only hot path.
   */
  branchId: string
  from: BookingStatus
  to: BookingStatus
  actorId: string
  /** Snapshotted (`0002:478`) — a later role change must not rewrite history. */
  actorRole: SystemRole
  /** Law 8 — the action key, generated where the user acted, not at send time. */
  clientUuid: string
  /** §1.9 — flags standing on the booking now. */
  flags?: readonly Flag[]
  /** §1.7 — required when `to` is `'Closed'`; `planTransition` refuses without it. */
  gates?: CloseGateInput
  /** AD, UTC (law 7). Defaults to now. The value causal-order validation compares. */
  occurredAt?: string
  reason?: string
}

export interface BookingTransitionResult {
  /** False when the engine refused — read `plan.blockers` for every reason. */
  ok: boolean
  plan: TransitionPlan
}

/** `booking_stage_transitions.source` for a transition the OS itself applied, as opposed to `'booqable-sync'`. */
export const OS_TRANSITION_SOURCE = 'os-native'

/**
 * Applies one forward stage transition, or refuses it with every blocking
 * reason (law 12 — the screen renders them inline, it does not toast them).
 *
 * On success the audit row is written **after** the transition, so a rejected
 * insert never leaves an audit event claiming a move that did not happen.
 *
 * Note for whoever writes `0002`'s "every stage change writes an audit_events
 * row" trigger: this call becomes redundant at that point and should be dropped
 * here rather than duplicated in both places.
 */
export async function applyBookingTransition(req: BookingTransitionRequest): Promise<BookingTransitionResult> {
  const plan = planTransition({
    from: req.from,
    to: req.to,
    ...(req.flags === undefined ? {} : { flags: req.flags }),
    ...(req.gates === undefined ? {} : { gates: req.gates }),
  })

  if (!plan.allowed) return { ok: false, plan }

  const occurredAt = req.occurredAt ?? new Date().toISOString()
  const reason = req.reason ?? null

  await idempotentInsert(
    'booking_stage_transitions',
    {
      client_uuid: req.clientUuid,
      booking_id: req.bookingId,
      branch_id: req.branchId,
      from_stage: req.from,
      to_stage: req.to,
      is_reversal: false,
      reason,
      occurred_at: occurredAt,
      actor_id: req.actorId,
      actor_role: req.actorRole,
      source: OS_TRANSITION_SOURCE,
    },
    /* RULING 2026-09-21 (Audit-01 P0-01): never queue a stage transition.
       This table's trigger is the ONLY writer of `bookings.stage` (0021/
       0094), so a queued insert is a move the database never made — and a
       resolved promise here is what lets a caller claim it did. Opt out of
       the outbox on BOTH dataAccess paths: offline, and a 'Failed to fetch'
       /408 on a live connection. The row still carries the caller's Law 8
       key, so a retry after a line cut is the duplicate branch, not a
       second transition. */
    { queueOnFailure: false },
  )

  await logAuditEvent({
    eventClass: 'status change',
    category: 'Rentals',
    module: 'Rentals',
    action: 'Update',
    severity: 'Informational',
    tableName: 'bookings',
    recordId: req.bookingId,
    actorId: req.actorId,
    actorRole: req.actorRole,
    branchId: req.branchId,
    oldValues: { stage: req.from },
    newValues: { stage: req.to },
    reason,
  })

  return { ok: true, plan }
}
