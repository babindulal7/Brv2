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
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.itemDescription) throw new Error('Item description is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    /* Prefix from Settings > Numbering, never a literal - ruling 2.2. */
    const generatedId = issue('SR', Number(Date.now().toString().slice(-4)));

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
