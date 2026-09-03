import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ResolveCaseInput = {
  caseId: string;
  resolution?: string;
};

export const resolveCase = createAction<ResolveCaseInput, { success: boolean }>({
  name: 'RESOLVE_CASE',
  permissions: ['case.resolve'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.caseId) throw new Error('Case ID is required.');
  },

  execute: async (input, ctx: ActionContext) => {
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
