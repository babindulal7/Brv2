import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CompleteReturnInput = {
  rentalId: string;
  equipmentIds: string[];
  notes?: string;
};

/**
 * The Global Action for returning a rental.
 * This is the ONLY place where return logic is processed.
 */
export const completeReturn = createAction<CompleteReturnInput, { success: boolean }>({
  name: 'COMPLETE_RETURN',
  permissions: ['rental.return'],
  
  validate: (input) => {
    if (!input.rentalId) throw new Error("Rental ID is required.");
    if (!input.equipmentIds || input.equipmentIds.length === 0) throw new Error("Equipment IDs are required for return.");
  },

  execute: async (input, ctx: ActionContext) => {
    // 1. Current-state check (Mock)
    console.log(`[Domain] Checking if rental ${input.rentalId} is eligible for return...`);
    
    // 2. Database Transaction (Mock)
    console.log(`[DB TX] Updating Rental ${input.rentalId} status to RETURNED`);
    console.log(`[DB TX] Updating Equipment ${input.equipmentIds.join(', ')} to INSPECTION_REQUIRED`);
    console.log(`[DB TX] Creating Inspection Task in Operations Queue`);
    console.log(`[DB TX] Updating Calendar actual return dates`);

    // 3. Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.RENTAL_RETURNED,
        payload: {
          rentalId: input.rentalId,
          equipmentIds: input.equipmentIds,
          timestamp: new Date().toISOString(),
          userId: ctx.userId
        }
      },
      ...input.equipmentIds.map(id => ({
        type: EVENT_TYPES.INSPECTION_REQUIRED,
        payload: { equipmentId: id, rentalId: input.rentalId }
      }))
    ];

    return {
      result: { success: true },
      events
    };
  }
});
