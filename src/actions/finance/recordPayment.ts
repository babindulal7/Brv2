import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type RecordPaymentInput = {
  bookingId?: string | undefined;
  amountPaisa: number;
  paymentMethod?: string | undefined;
  reference?: string | undefined;
};

export const recordPayment = createAction<RecordPaymentInput, { success: boolean; paymentId: string }>({
  name: 'RECORD_PAYMENT',
  permissions: ['payment.create'],

  validate: (input) => {
    if (input.amountPaisa <= 0) throw new Error('Payment amount must be greater than zero.');
  },

  execute: async (input, ctx: ActionContext) => {
    const paymentId = `PAY-${Date.now().toString().slice(-4)}`;
    console.log(`[DB TX] Recorded payment ${paymentId}: ${input.amountPaisa / 100} NPR against booking ${input.bookingId ?? 'N/A'}`);

    const events = [
      {
        type: EVENT_TYPES.PAYMENT_RECORDED,
        payload: {
          paymentId,
          bookingId: input.bookingId,
          amountPaisa: input.amountPaisa,
          paymentMethod: input.paymentMethod ?? 'Cash/Bank',
          reference: input.reference,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, paymentId },
      events,
    };
  },
});
