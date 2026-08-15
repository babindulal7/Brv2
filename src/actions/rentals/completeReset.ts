import { createAction, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { runFloorVerb, validateFloorVerb, type FloorVerbResult } from './floorVerb';

/**
 * **Reset — the fourth floor verb, and the one that changes no stage.**
 *
 * `JOBS.Reset` is `{ runsAt: 'Returned', sets: null, blocksBooking: false }`, and
 * §1.5 says why: "Reset blocks the *item* returning to Available, never the
 * booking." `runFloorVerb` reads `sets: null` and makes no transition, so this
 * file needs no special case — the difference is data, not a branch.
 *
 * It is also the only verb with **no session**. `0003:855-857`: "Reset and
 * Cleaning are two modes of this one workspace, which is why neither has a
 * session." The record is `cleaning_queue_entries.reset_completed_at`, set per
 * item, because `0003:899` states the queue is per item and not per booking.
 * That is why this takes unit ids and its three siblings take booking lines.
 */
export type CompleteResetInput = {
  /** `bookings.id` (uuid) or `bookings.booking_no` (`B-` + digits — corrected 15 Aug 2026, see `confirmRental.ts`). */
  id: string;
  /**
   * `cleaning_queue_entries.unit_id` for each item whose reset was completed.
   *
   * **Required in practice** — `validate` refuses an empty list. The obvious
   * shortcut, "reset everything queued for this booking", is not available: which
   * items an operator actually reset is a floor fact, and deriving it from the
   * queue would assert work on items nobody touched.
   */
  unitIds?: string[];
  /** Law 8 — the action key, minted where the user acted. */
  clientUuid?: string;
  /** AD/UTC. Defaults to now. */
  occurredAt?: string;
};

export const completeReset = createAction<CompleteResetInput, FloorVerbResult>({
  name: 'COMPLETE_RESET',
  // Was `rental.reset`, which `core.ts:checkCapability` cannot resolve and
  // therefore denies. `operations.perform` is the rule that actually exists.
  permissions: ['operations.perform'],
  implemented: true,

  validate: (input) =>
    validateFloorVerb('Reset', {
      bookingRef: input.id,
      ...(input.unitIds === undefined ? {} : { unitIds: input.unitIds }),
    }),

  execute: async (input, ctx: ActionContext) => {
    const result = await runFloorVerb(
      'Reset',
      {
        bookingRef: input.id,
        ...(input.unitIds === undefined ? {} : { unitIds: input.unitIds }),
        ...(input.clientUuid === undefined ? {} : { clientUuid: input.clientUuid }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
      },
      ctx,
    );

    return {
      result,
      events: [
        {
          type: EVENT_TYPES.RENTAL_RESET_COMPLETED,
          payload: {
            bookingId: result.bookingId,
            unitsReset: result.unitsReset,
            // Stated, not omitted: Reset completing changes no booking status,
            // and a consumer that assumed otherwise would be wrong in silence.
            stage: null,
            timestamp: new Date().toISOString(),
            userId: ctx.userId,
          },
        },
      ],
    };
  },
});
