import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CompletePickupInput = {
  rentalId: string;
  equipmentIds: string[];
};

export const completePickup = createAction<CompletePickupInput, { success: boolean }>({
  name: 'COMPLETE_PICKUP',
  permissions: ['rental.pickup'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,
  
  validate: (input) => {
    if (!input.rentalId) throw new Error("Rental ID is required.");
    if (!input.equipmentIds || input.equipmentIds.length === 0) throw new Error("Equipment IDs are required for pickup.");
  },

  execute: async (input, ctx: ActionContext) => {
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
