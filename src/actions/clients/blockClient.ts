import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type BlockClientInput = {
  clientId: string;
  blocked: boolean;
  reason?: string;
};

export const blockClient = createAction<BlockClientInput, { success: boolean }>({
  name: 'BLOCK_CLIENT',
  permissions: ['client.block'],

  validate: (input) => {
    if (!input.clientId) throw new Error('Client ID is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Client ${input.clientId} ${input.blocked ? 'BLOCKED' : 'UNBLOCKED'}`);

    const events = [
      {
        type: EVENT_TYPES.CLIENT_STATUS_UPDATED,
        payload: {
          clientId: input.clientId,
          blocked: input.blocked,
          reason: input.reason,
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
