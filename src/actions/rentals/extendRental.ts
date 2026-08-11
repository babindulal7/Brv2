import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ExtendRentalInput = {
  id: string; // Placeholder for actual input schema
};

export const extendRental = createAction<ExtendRentalInput, { success: boolean }>({
  name: 'EXTEND_RENTAL',
  permissions: ['rental.extend'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing EXTEND_RENTAL for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.RENTAL_EXTENDED,
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
