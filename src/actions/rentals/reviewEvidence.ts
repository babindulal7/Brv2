import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ReviewEvidenceInput = {
  evidenceId: string;
  action: 'review' | 'remove';
  reason?: string;
};

export const reviewEvidence = createAction<ReviewEvidenceInput, { success: boolean }>({
  name: 'REVIEW_EVIDENCE',
  permissions: ['evidence.review'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.evidenceId) throw new Error('Evidence ID is required.');
    if (!input.action) throw new Error('Action must be review or remove.');
  },

  execute: async (input, ctx: ActionContext) => {
    const events = [
      {
        type: EVENT_TYPES.EVIDENCE_REVIEWED,
        payload: {
          evidenceId: input.evidenceId,
          action: input.action,
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
