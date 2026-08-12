import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { prefixOf } from '../../data/numbering';

export type CreateEquipmentInput = {
  name: string;
  category?: string;
  quantity?: number;
  isDraft?: boolean;
};

export const createEquipment = createAction<CreateEquipmentInput, { success: boolean; equipmentId: string }>({
  name: 'CREATE_EQUIPMENT',
  permissions: ['inventory.create'],

  validate: (input) => {
    if (!input.name) throw new Error('Equipment name is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * Prefix from `Settings ▸ Numbering` — ruling §2.2. The *shape* is left
     * alone: Equipment is not in the ruling's table and its three authorities
     * already contradict each other (`numbering.ts` says `EQ-CAT-NNNNNN`,
     * `lib/seed.ts` and `products_asset_code_format` say `EQ000234`). Picking
     * one here would be inventing a product decision. TODO(decision).
     */
    const generatedId = `${prefixOf('EQ')}-${Date.now().toString().slice(-4)}`;
    console.log(`[DB TX] Created equipment ${generatedId}: ${input.name} (Draft: ${!!input.isDraft})`);

    const events = [
      {
        type: EVENT_TYPES.EQUIPMENT_CREATED,
        payload: {
          equipmentId: generatedId,
          name: input.name,
          category: input.category,
          quantity: input.quantity ?? 1,
          isDraft: !!input.isDraft,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, equipmentId: generatedId },
      events,
    };
  },
});
