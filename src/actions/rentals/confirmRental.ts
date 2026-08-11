import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ConfirmRentalInput = {
  id: string; // Placeholder for actual input schema
};

export const confirmRental = createAction<ConfirmRentalInput, { success: boolean }>({
  name: 'CONFIRM_RENTAL',
  permissions: ['rental.confirm'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing CONFIRM_RENTAL for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.RENTAL_CONFIRMED,
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
