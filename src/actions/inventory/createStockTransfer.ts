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
    /*
     * TODO(decision) — the one prefix in this layer still written as a
     * literal. `data/warehouse.ts` and `Warehouses.tsx` issue `TR-2026-0045`
     * while the registry's Transfer row is coded `TRF` with prefix `TRF`.
     * Stock Transfer is not in the 12 Aug ruling's table, so choosing between
     * `TR` and `TRF` would be inventing a product decision; reading
     * `prefixOf('TRF')` here would silently renumber a live series.
     */
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
