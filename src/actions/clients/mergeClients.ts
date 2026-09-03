import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type MergeClientsInput = {
  survivorId: string;
  duplicateId: string;
};

export const mergeClients = createAction<MergeClientsInput, { success: boolean }>({
  name: 'MERGE_CLIENTS',
  permissions: ['client.merge'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.survivorId || !input.duplicateId) throw new Error('Both survivor and duplicate IDs are required.');
  },

  execute: async (input, ctx: ActionContext) => {
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
