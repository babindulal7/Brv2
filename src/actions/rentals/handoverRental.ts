import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type HandoverRentalInput = {
  bookingId: string;
  unitIds: string[];
  sessionId?: string;
};

export const handoverRental = createAction<HandoverRentalInput, { success: boolean; count: number }>({
  name: 'HANDOVER_RENTAL',
  permissions: ['rental.handover'],

  validate: (input) => {
    if (!input.bookingId) throw new Error('Booking ID is required.');
    if (!input.unitIds || input.unitIds.length === 0) throw new Error('At least one unit ID must be specified.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Handing over ${input.unitIds.length} unit(s) for booking ${input.bookingId}`);

    const events = [
      {
        type: EVENT_TYPES.RENTAL_HANDED_OVER,
        payload: {
          bookingId: input.bookingId,
          unitIds: input.unitIds,
          sessionId: input.sessionId,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, count: input.unitIds.length },
      events,
    };
  },
});
