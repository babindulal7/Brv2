import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { issue } from '../../data/numbering';

export type CreateSubRentalInput = {
  vendorId?: string;
  itemDescription: string;
  costPaisa: number;
};

export const createSubRental = createAction<CreateSubRentalInput, { success: boolean; subRentalId: string }>({
  name: 'CREATE_SUBRENTAL',
  permissions: ['subrental.create'],

  validate: (input) => {
    if (!input.itemDescription) throw new Error('Item description is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    /* Prefix from Settings > Numbering, never a literal - ruling 2.2. */
    const generatedId = issue('SR', Number(Date.now().toString().slice(-4)));
    console.log(`[DB TX] Created Sub-Rental ${generatedId}: ${input.itemDescription}`);

    const events = [
      {
        type: EVENT_TYPES.SUBRENTAL_CREATED,
        payload: {
          subRentalId: generatedId,
          vendorId: input.vendorId,
          itemDescription: input.itemDescription,
          costPaisa: input.costPaisa,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, subRentalId: generatedId },
      events,
    };
  },
});
