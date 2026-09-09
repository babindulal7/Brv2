import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type RefundPaymentInput = {
  /**
   * Target identifier:
   * - `paymentId` (UUID or payment_no like 'PAY-2026-0001') OR
   * - `invoiceId` (UUID or invoice_no like 'INV-492') OR
   * - `id` (payment or invoice identifier)
   */
  id?: string;
  paymentId?: string;
  invoiceId?: string;
  /** Amount to reverse in Rupees (numeric > 0). If omitted, reverses the payment's full amount */
  amount?: number;
  /** Reason for the reversal (minimum 10 characters per Law 4 / DB check constraint) */
  reason?: string;
  /** Custom reversal sequence number (e.g. 'REV-2026-0001') */
  reversalNo?: string;
  /** Optional user UUID approving the reversal (defaults to ctx.userId) */
  approvedBy?: string;
  /** Optional Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type RefundPaymentResult = {
  success: boolean;
  id: string;
  reversalNo: string;
  originalPaymentId: string;
  amount: number;
};

export const refundPaymentConfig: ActionConfig<RefundPaymentInput, RefundPaymentResult> = {
  name: 'REFUND_PAYMENT',
  permissions: ['payment.refund'],
  implemented: true,

  validate: (input) => {
    const hasTarget = Boolean(
      (input.id && input.id.trim()) ||
      (input.paymentId && input.paymentId.trim()) ||
      (input.invoiceId && input.invoiceId.trim())
    );
    if (!hasTarget) {
      throw new Error('Payment or Invoice identifier is required to process refund reversal.');
    }
    if (input.amount !== undefined && (typeof input.amount !== 'number' || input.amount <= 0 || isNaN(input.amount))) {
      throw new Error('Refund reversal amount must be a positive number greater than 0.');
    }
    if (input.reason !== undefined && input.reason.trim().length > 0 && input.reason.trim().length < 10) {
      throw new Error('Reversal reason must be at least 10 characters (Law 4).');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const target = (input.paymentId || input.invoiceId || input.id || '').trim();
    let resolvedPayment: { id: string; payment_no: string; amount: number; invoice_id?: string | null } | null = null;

    // 1. Try finding payment directly by ID or payment_no
    const { data: paymentData } = await supabase
      .from('payments')
      .select('id, payment_no, amount, invoice_id')
      .or(`id.eq.${target},payment_no.eq.${target}`)
      .maybeSingle();

    if (paymentData) {
      resolvedPayment = paymentData;
    } else {
      // 2. Try finding invoice by ID or invoice_no
      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('id, invoice_no')
        .or(`id.eq.${target},invoice_no.eq.${target}`)
        .maybeSingle();

      if (invoiceData) {
        // Find latest payment for this invoice
        const { data: invoicePayments } = await supabase
          .from('payments')
          .select('id, payment_no, amount, invoice_id')
          .eq('invoice_id', invoiceData.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (invoicePayments && invoicePayments.length > 0) {
          resolvedPayment = invoicePayments[0]!;
        } else {
          throw new Error(`No payment records found for invoice '${target}' to reverse.`);
        }
      }
    }

    if (!resolvedPayment) {
      throw new Error(`Could not find payment or invoice matching '${target}'.`);
    }

    const finalAmount = input.amount !== undefined ? Number(input.amount) : Number(resolvedPayment.amount);
    if (finalAmount <= 0) {
      throw new Error('Refund reversal amount must be greater than 0.');
    }

    const rawReason = input.reason?.trim();
    const finalReason =
      rawReason && rawReason.length >= 10
        ? rawReason
        : `Reversal of payment ${resolvedPayment.payment_no} for refund`;

    // Generate reversal number if not given
    let reversalNo = input.reversalNo?.trim();
    if (!reversalNo) {
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('payment_reversals')
        .select('*', { count: 'exact', head: true });
      const nextSeq = (count ?? 0) + 1;
      reversalNo = `REV-${year}-${String(nextSeq).padStart(4, '0')}`;
    }

    const actionUuid = input.clientUuid || generateClientUuid();
    const reversedBy = ctx.userId;
    const approvedBy = input.approvedBy || ctx.userId;
    const now = new Date().toISOString();

    const reversalRow = {
      client_uuid: actionUuid,
      reversal_no: reversalNo,
      original_payment_id: resolvedPayment.id,
      amount: finalAmount,
      reason: finalReason,
      reversed_by: reversedBy,
      approved_by: approvedBy,
      reversed_at: now,
      created_at: now,
    };

    const inserted = await idempotentInsert('payment_reversals' as never, reversalRow as never);
    const insertedId = (inserted as { id?: string })?.id || actionUuid;

    const events = [
      {
        type: EVENT_TYPES.PAYMENT_REFUNDED,
        payload: {
          id: insertedId,
          reversalNo,
          originalPaymentId: resolvedPayment.id,
          amount: finalAmount,
          reason: finalReason,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        id: insertedId,
        reversalNo,
        originalPaymentId: resolvedPayment.id,
        amount: finalAmount,
      },
      events,
    };
  },
};

export const refundPayment = createAction<RefundPaymentInput, RefundPaymentResult>(refundPaymentConfig);
