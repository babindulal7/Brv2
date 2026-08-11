import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ResolveCaseInput = {
  caseId: string;
  resolution?: string;
};

export const resolveCase = createAction<ResolveCaseInput, { success: boolean }>({
  name: 'RESOLVE_CASE',
  permissions: ['case.resolve'],

  validate: (input) => {
    if (!input.caseId) throw new Error('Case ID is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Operational Case ${input.caseId} resolved`);

    const events = [
      {
        type: EVENT_TYPES.CASE_RESOLVED,
        payload: {
          caseId: input.caseId,
          resolution: input.resolution ?? 'Resolved',
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
