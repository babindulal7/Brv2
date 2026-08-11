import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

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
    const generatedId = `EQ-${Date.now().toString().slice(-4)}`;
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
