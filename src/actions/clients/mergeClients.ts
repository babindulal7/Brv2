import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type MergeClientsInput = {
  survivorId: string;
  duplicateId: string;
};

export const mergeClients = createAction<MergeClientsInput, { success: boolean }>({
  name: 'MERGE_CLIENTS',
  permissions: ['client.merge'],

  validate: (input) => {
    if (!input.survivorId || !input.duplicateId) throw new Error('Both survivor and duplicate IDs are required.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Merged client duplicate ${input.duplicateId} into survivor ${input.survivorId}`);

    const events = [
      {
        type: EVENT_TYPES.CLIENT_MERGED,
        payload: {
          survivorId: input.survivorId,
          duplicateId: input.duplicateId,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true },
      events,
    };
  },
});
