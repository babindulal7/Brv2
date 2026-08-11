import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type ReconcileStockCheckInput = {
  sessionId?: string;
  scannedCount: number;
  totalCount: number;
};

export const reconcileStockCheck = createAction<ReconcileStockCheckInput, { success: boolean }>({
  name: 'RECONCILE_STOCK_CHECK',
  permissions: ['inventory.audit'],

  validate: (input) => {
    if (input.scannedCount < 0) throw new Error('Scanned count cannot be negative.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Reconciled stock audit: ${input.scannedCount}/${input.totalCount} items verified`);

    const events = [
      {
        type: EVENT_TYPES.STOCK_RECONCILED,
        payload: {
          sessionId: input.sessionId ?? 'session-current',
          scannedCount: input.scannedCount,
          totalCount: input.totalCount,
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
