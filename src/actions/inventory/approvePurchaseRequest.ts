import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ApprovePurchaseRequestInput = {
  prId: string;
  status: 'Approved' | 'Rejected' | 'Ordered';
};

export const approvePurchaseRequest = createAction<ApprovePurchaseRequestInput, { success: boolean }>({
  name: 'APPROVE_PURCHASE_REQUEST',
  permissions: ['purchase.approve'],

  validate: (input) => {
    if (!input.prId) throw new Error('Purchase Request ID is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Purchase Request ${input.prId} updated to ${input.status}`);

    const events = [
      {
        type: EVENT_TYPES.PURCHASE_REQUEST_UPDATED,
        payload: {
          prId: input.prId,
          status: input.status,
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
