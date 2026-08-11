import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CreateClientInput = {
  name: string;
  phone?: string;
  email?: string;
  isDraft?: boolean;
};

export const createClient = createAction<CreateClientInput, { success: boolean; clientId: string }>({
  name: 'CREATE_CLIENT',
  permissions: ['client.create'],

  validate: (input) => {
    if (!input.name) throw new Error('Client name is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    const generatedId = `CL-${Date.now().toString().slice(-4)}`;
    console.log(`[DB TX] Created client ${generatedId}: ${input.name} (Draft: ${!!input.isDraft})`);

    const events = [
      {
        type: EVENT_TYPES.CLIENT_CREATED,
        payload: {
          clientId: generatedId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          isDraft: !!input.isDraft,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, clientId: generatedId },
      events,
    };
  },
});
