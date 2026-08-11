import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CancelRentalInput = {
  id: string; // Placeholder for actual input schema
};

export const cancelRental = createAction<CancelRentalInput, { success: boolean }>({
  name: 'CANCEL_RENTAL',
  permissions: ['rental.cancel'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing CANCEL_RENTAL for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.RENTAL_CANCELLED,
        payload: {
          id: input.id,
          timestamp: new Date().toISOString(),
          userId: ctx.userId
        }
      }
    ];

    return {
      result: { success: true },
      events
    };
  }
});
