import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type PackRentalInput = {
  id: string; // Placeholder for actual input schema
};

export const packRental = createAction<PackRentalInput, { success: boolean }>({
  name: 'PACK_RENTAL',
  permissions: ['rental.pack'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing PACK_RENTAL for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.RENTAL_PACKED,
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
