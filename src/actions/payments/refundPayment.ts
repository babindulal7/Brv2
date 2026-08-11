import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type RefundPaymentInput = {
  id: string; // Placeholder for actual input schema
};

export const refundPayment = createAction<RefundPaymentInput, { success: boolean }>({
  name: 'REFUND_PAYMENT',
  permissions: ['payment.refund'],
  
  validate: (input) => {
    if (!input.id) throw new Error("ID is required.");
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Executing REFUND_PAYMENT for ${input.id}`);

    // Prepare Domain Events to be emitted
    const events = [
      {
        type: EVENT_TYPES.PAYMENT_REFUNDED,
        payload: {
          id: input.id,
          timestamp: new Date().toISOString(),
          userId: ctx.userId
        }
      }
    ];

    return {
      result: { success: true },
      events
    };
  }
});
