import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CompletePickupInput = {
  rentalId: string;
  equipmentIds: string[];
};

export const completePickup = createAction<CompletePickupInput, { success: boolean }>({
  name: 'COMPLETE_PICKUP',
  permissions: ['rental.pickup'],
  
  validate: (input) => {
    if (!input.rentalId) throw new Error("Rental ID is required.");
    if (!input.equipmentIds || input.equipmentIds.length === 0) throw new Error("Equipment IDs are required for pickup.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Updating Rental ${input.rentalId} status to ACTIVE`);
    console.log(`[DB TX] Updating Equipment ${input.equipmentIds.join(', ')} to CHECKED_OUT`);

    const events = [
      {
        type: EVENT_TYPES.RENTAL_CONFIRMED, // Or custom PICKED_UP event
        payload: {
          rentalId: input.rentalId,
          equipmentIds: input.equipmentIds,
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
