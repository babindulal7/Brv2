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

  validate: (input) => {
    if (!input.evidenceId) throw new Error('Evidence ID is required.');
    if (!input.action) throw new Error('Action must be review or remove.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Evidence ${input.evidenceId} ${input.action}ed`);

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
