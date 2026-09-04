import { createAction, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import {
  runFloorVerb,
  validateFloorVerb,
  type FloorLineInput,
  type FloorVerbResult,
} from './floorVerb';

/**
 * **Handover — the second floor verb.** Runs at `JOBS.Handover.runsAt` =
 * `Packed`, and completing it sets `On Rent` — but only when every live line
 * reaches `Picked Up` or `Missing-with-reason` (`0003:340`). A staggered
 * collection records itself in full and leaves the booking at `Packed`; see
 * `stageHeldBy` on the result.
 *
 * ⚠ **`unitIds` and `sessionId` are gone from this input.** They could not be
 * written: `session_line_movements.unit_id` is a `product_units` FK and
 * `booking_line_id` is NOT NULL, so a flat list of unit ids with no line to hang
 * them on resolves to nothing the schema accepts. Units now travel inside their
 * line (`FloorLineInput.unitIds`). `sessionId` is likewise not a caller's to
 * choose — `runFloorVerb` opens the session, and `operation_sessions.session_no`
 * is read from the booking's existing sessions (`0003:85`), not passed in.
 */
export type HandoverRentalInput = {
  /** `bookings.id` (uuid) or `bookings.booking_no` (`B-` + digits — corrected 15 Aug 2026, see `confirmRental.ts`). */
  bookingId: string;
  /**
   * The booking lines this session handed over, each naming a `booking_lines.id`
   * and the `product_units.id`s scanned against it. `validate` refuses an empty
   * list — a handover session with no lines would claim gear left the building.
   */
  lines?: FloorLineInput[];
  /** Law 8 — the action key, minted where the user acted. */
  clientUuid?: string;
  /** Free text onto `operation_sessions.notes`. */
  notes?: string;
  /**
   * **R-06.** The named reason for handing over while the rental balance or the
   * security deposit is unpaid. Without it the database still refuses; with it
   * the handover proceeds and the reason is recorded in `audit_events` against
   * the person who gave it, with both amounts as they stood.
   */
  overrideReason?: string;
  /** AD/UTC. Defaults to now. */
  occurredAt?: string;
  /** Gate 1 — checked against the receiver's physical ID at the counter. Written to `operation_sessions`. */
  governmentIdVerified?: boolean;
  bookingAuthorizationVerified?: boolean;
};

export const handoverRental = createAction<HandoverRentalInput, FloorVerbResult>({
  name: 'HANDOVER_RENTAL',
  // Was `rental.handover`, which `core.ts:checkCapability` cannot resolve and
  // therefore denies. `operations.perform` is the rule that actually exists.
  permissions: ['operations.perform'],
  implemented: true,

  validate: (input) =>
    validateFloorVerb('Handover', {
      bookingRef: input.bookingId,
      ...(input.lines === undefined ? {} : { lines: input.lines }),
    }),

  execute: async (input, ctx: ActionContext) => {
    const result = await runFloorVerb(
      'Handover',
      {
        bookingRef: input.bookingId,
        ...(input.lines === undefined ? {} : { lines: input.lines }),
        ...(input.clientUuid === undefined ? {} : { clientUuid: input.clientUuid }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.overrideReason === undefined ? {} : { overrideReason: input.overrideReason }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        ...(input.governmentIdVerified === undefined ? {} : { governmentIdVerified: input.governmentIdVerified }),
        ...(input.bookingAuthorizationVerified === undefined
          ? {}
          : { bookingAuthorizationVerified: input.bookingAuthorizationVerified }),
      },
      ctx,
    );

    return {
      result,
      events: [
        {
          type: EVENT_TYPES.RENTAL_HANDED_OVER,
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
