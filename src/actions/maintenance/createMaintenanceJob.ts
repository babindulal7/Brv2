import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CreateMaintenanceJobInput = {
  id: string; // Placeholder for actual input schema
};

export const createMaintenanceJob = createAction<CreateMaintenanceJobInput, { success: boolean }>({
  name: 'CREATE_MAINTENANCE_JOB',
  permissions: ['maintenance.create'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing CREATE_MAINTENANCE_JOB for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.MAINTENANCE_STARTED,
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
