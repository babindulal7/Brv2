import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ReserveEquipmentInput = {
  id: string; // Placeholder for actual input schema
};

export const reserveEquipment = createAction<ReserveEquipmentInput, { success: boolean }>({
  name: 'RESERVE_EQUIPMENT',
  permissions: ['inventory.reserve'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.INVENTORY_RESERVED,
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
