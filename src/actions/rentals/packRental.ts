import { createAction, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import {
  runFloorVerb,
  validateFloorVerb,
  type FloorLineInput,
  type FloorVerbResult,
} from './floorVerb';

/**
 * **Pack — the first floor verb.** Runs at `JOBS.Pack.runsAt` = `Booked`, and
 * completing it sets `Packed`. Both facts are read from `src/lib/workflow.ts`
 * inside `runFloorVerb`, never restated here, so this file cannot drift from
 * `operationQueue('packing')` — which selects the same stage from the same
 * table.
 *
 * The write is an `operation_sessions` row with `operation = 'Packing'` plus one
 * `packing_lines` row per booking line and its `session_line_movements`. See
 * `./floorVerb.ts` for the whole shape; all four verbs share it.
 */
export type PackRentalInput = {
  /** `bookings.id` (uuid) or `bookings.booking_no` (`BK-YYYY-NNNN`). */
  id: string;
  /**
   * The booking lines this session resolved, each naming a `booking_lines.id`.
   *
   * **Required in practice** — `validate` refuses an empty list. A packing
   * session with no lines would claim work on nothing, and deriving the lines
   * from the booking instead would assert that every line on it was packed,
   * which is the fabrication this whole layer exists to prevent.
   */
  lines?: FloorLineInput[];
  /** Law 8 — the action key, minted where the user pressed Complete Packing. */
  clientUuid?: string;
  /** Free text onto `operation_sessions.notes`. */
  notes?: string;
  /** AD/UTC. Defaults to now. */
  occurredAt?: string;
};

export const packRental = createAction<PackRentalInput, FloorVerbResult>({
  name: 'PACK_RENTAL',
  // `operations.perform` is one of the seven capabilities `core.ts`'s
  // `checkCapability` can actually resolve; it lands on `rbac.canPerformOperations`.
  // The previous `rental.pack` resolved to nothing, and an unmapped capability
  // is denied, so this action was refused by name before it was ever run.
  permissions: ['operations.perform'],
  implemented: true,

  validate: (input) =>
    validateFloorVerb('Pack', {
      bookingRef: input.id,
      ...(input.lines === undefined ? {} : { lines: input.lines }),
    }),

  execute: async (input, ctx: ActionContext) => {
    const result = await runFloorVerb(
      'Pack',
      {
        bookingRef: input.id,
        ...(input.lines === undefined ? {} : { lines: input.lines }),
        ...(input.clientUuid === undefined ? {} : { clientUuid: input.clientUuid }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
      },
      ctx,
    );

    // The event follows the write, and carries what actually landed — including
    // the case where the session was recorded but the stage was held back by
    // lines this session could not finish.
    return {
      result,
      events: [
        {
          type: EVENT_TYPES.RENTAL_PACKED,
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
      ],
    };
  },
});
