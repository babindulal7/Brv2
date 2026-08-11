import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CreateStockTransferInput = {
  transferId?: string;
  sourceWarehouse?: string;
  targetWarehouse?: string;
  status?: string;
  itemCount?: number;
};

export const createStockTransfer = createAction<CreateStockTransferInput, { success: boolean; transferId: string }>({
  name: 'CREATE_STOCK_TRANSFER',
  permissions: ['inventory.transfer'],

  validate: (input) => {
    if (input.transferId === undefined && !input.sourceWarehouse) {
      throw new Error('Source warehouse is required for new transfers.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const transferId = input.transferId ?? `TR-${Date.now().toString().slice(-4)}`;
    console.log(`[DB TX] Stock transfer ${transferId} state: ${input.status ?? 'Created'}`);

    const events = [
      {
        type: EVENT_TYPES.TRANSFER_UPDATED,
        payload: {
          transferId,
          sourceWarehouse: input.sourceWarehouse,
          targetWarehouse: input.targetWarehouse,
          status: input.status ?? 'Created',
          itemCount: input.itemCount ?? 1,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, transferId },
      events,
    };
  },
});
