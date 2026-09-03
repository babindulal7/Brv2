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
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (input.scannedCount < 0) throw new Error('Scanned count cannot be negative.');
  },

  execute: async (input, ctx: ActionContext) => {
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
