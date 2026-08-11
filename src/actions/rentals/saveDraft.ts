import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type SaveDraftInput = {
  id: string; // Placeholder for actual input schema
};

export const saveDraft = createAction<SaveDraftInput, { success: boolean }>({
  name: 'SAVE_DRAFT',
  permissions: ['rental.draft'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing SAVE_DRAFT for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.DRAFT_SAVED,
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
