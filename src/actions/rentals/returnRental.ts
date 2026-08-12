import { createAction, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import {
  runFloorVerb,
  validateFloorVerb,
  type FloorLineInput,
  type FloorVerbResult,
} from './floorVerb';

/**
 * **Return — the third floor verb.** Runs at `JOBS.Return.runsAt` = `On Rent`,
 * and completing it sets `Returned` — but only when every live line reaches
 * `Returned` or `Not Returned` (`0003:399`). A part-received booking records its
 * session in full and stays `On Rent`; see `stageHeldBy` on the result.
 *
 * Inspection is not a separate screen or a separate write: `return_lines`
 * carries `condition`, `inspection_state`, `inspected_by` and `inspected_at`
 * side by side with the line state (`0003:356-385`), so supplying a line's
 * `condition` is what marks it Inspected — together with the actor and the time,
 * because CHECK `:382` accepts the three together or not at all.
 *
 * ⚠ **The export is `completeReturn`, not `returnRental`.** It has been that
 * since the file was written and `MovementList.tsx` imports it by that name;
 * renaming it would be a second change wearing this one's clothes.
 *
 * ⚠ **`equipmentIds` is gone.** A flat list of equipment ids could not be
 * written: `session_line_movements` needs a NOT NULL `booking_line_id` to hang a
 * unit on. Units now travel inside their line (`FloorLineInput.unitIds`).
 */
export type CompleteReturnInput = {
  /** `bookings.id` (uuid) or `bookings.booking_no` (`BK-YYYY-NNNN`). */
  rentalId: string;
  /**
   * The booking lines this session received. `validate` refuses an empty list —
   * a return session with no lines would claim gear came back that nobody saw.
   */
  lines?: FloorLineInput[];
  /** Free text onto `operation_sessions.notes` (`0003:80`). */
  notes?: string;
  /** Law 8 — the action key, minted where the user acted. */
  clientUuid?: string;
  /** AD/UTC. Defaults to now. */
  occurredAt?: string;
};

export const completeReturn = createAction<CompleteReturnInput, FloorVerbResult>({
  name: 'COMPLETE_RETURN',
  // Was `rental.return`, which `core.ts:checkCapability` cannot resolve and
  // therefore denies. `operations.perform` is the rule that actually exists.
  permissions: ['operations.perform'],
  implemented: true,

  validate: (input) =>
    validateFloorVerb('Return', {
      bookingRef: input.rentalId,
      ...(input.lines === undefined ? {} : { lines: input.lines }),
    }),

  execute: async (input, ctx: ActionContext) => {
    const result = await runFloorVerb(
      'Return',
      {
        bookingRef: input.rentalId,
        ...(input.lines === undefined ? {} : { lines: input.lines }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.clientUuid === undefined ? {} : { clientUuid: input.clientUuid }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
      },
      ctx,
    );

    // One INSPECTION_REQUIRED per line whose condition was NOT recorded in this
    // session. The old version emitted one per equipment id unconditionally,
    // which asked for an inspection of items it had just been told the condition
    // of. A line inspected here needs no second inspection raising.
    const uninspected = (input.lines ?? []).filter((l) => l.condition === undefined);

    return {
      result,
      events: [
        {
          type: EVENT_TYPES.RENTAL_RETURNED,
          payload: {
            bookingId: result.bookingId,
            sessionId: result.sessionId,
            lines: result.lines,
            movements: result.movements,
            stage: result.stage,
            stageHeldBy: result.stageHeldBy,
            timestamp: new Date().toISOString(),
            userId: ctx.userId,
          },
        },
        ...uninspected.map((line) => ({
          type: EVENT_TYPES.INSPECTION_REQUIRED,
          payload: { bookingLineId: line.bookingLineId, bookingId: result.bookingId, sessionId: result.sessionId },
        })),
      ],
    };
  },
});
