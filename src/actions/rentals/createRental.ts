import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CreateRentalInput = {
  id: string; // Placeholder for actual input schema
};

export const createRental = createAction<CreateRentalInput, { rentalId: string }>({
  name: 'CREATE_RENTAL',
  permissions: ['rental.create'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing CREATE_RENTAL for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.RENTAL_CREATED,
        payload: {
          id: input.id,
          timestamp: new Date().toISOString(),
          userId: ctx.userId
        }
      }
    ];

    return {
      result: { rentalId: 'new-id' },
      events
    };
  }
});
