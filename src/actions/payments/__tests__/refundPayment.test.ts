import { describe, it, expect, beforeEach, vi } from 'vitest';
import { refundPaymentConfig, type RefundPaymentInput } from '../refundPayment';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    payments: [
      { id: '11111111-1111-4111-8111-111111111111', payment_no: 'PAY-2026-0001', amount: 5000, invoice_id: 'inv-uuid-1' },
    ],
    invoices: [
      { id: 'inv-uuid-1', invoice_no: 'INV-492' },
    ],
    reversalsCount: 0,
    inserts: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
  };

  const queryMock = () => {
    let currentTable = '';
    let filterField = '';
    let filterVal: unknown = '';
    let orCondition = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        filterField = '';
        filterVal = '';
        orCondition = '';
        return chain;
      },
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head) {
          return Promise.resolve({ count: state.reversalsCount, error: null });
        }
        return chain;
      },
      eq: (field: string, val: unknown) => {
        filterField = field;
        filterVal = val;
        return chain;
      },
      or: (condition: string) => {
        orCondition = condition;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (currentTable === 'payments') {
          const match = state.payments.find(
            (p) =>
              (orCondition && (orCondition.includes(p.id) || orCondition.includes(p.payment_no))) ||
              (filterField && (p as Record<string, unknown>)[filterField] === filterVal)
          );
          return { data: match || null, error: null };
        }
        if (currentTable === 'invoices') {
          const match = state.invoices.find(
            (i) =>
              (orCondition && (orCondition.includes(i.id) || orCondition.includes(i.invoice_no))) ||
              (filterField && (i as Record<string, unknown>)[filterField] === filterVal)
          );
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: any) => {
        // Handles queries that end without maybeSingle (like array select with eq.order.limit)
        if (currentTable === 'payments' && filterField === 'invoice_id') {
          const matches = state.payments.filter((p) => p.invoice_id === filterVal);
          return resolve({ data: matches, error: null });
        }
        return resolve({ data: [], error: null });
      },
    };

    return chain;
  };

  const qInstance = queryMock();

  return {
    state,
    supabase: {
      from: (t: string) => qInstance.from(t),
    },
    idempotentInsert: async (table: string, row: Record<string, unknown>, options?: unknown) => {
      state.inserts.push({ table, row, options });
      state.reversalsCount++;
      return { id: 'rev-row-uuid-1', ...row };
    },
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}));

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: db.idempotentInsert,
  generateClientUuid: () => 'generated-client-uuid-refund',
}));

describe('REFUND_PAYMENT action', () => {
  beforeEach(() => {
    db.state.inserts = [];
    db.state.reversalsCount = 0;
  });

  it('declares implemented: true and permissions: [payment.refund]', () => {
    expect(refundPaymentConfig.implemented).toBe(true);
    expect(refundPaymentConfig.permissions).toEqual(['payment.refund']);
  });

  it('validates input: requires target identifier', () => {
    expect(() => refundPaymentConfig.validate({ id: '' })).toThrow(/identifier is required/);
    expect(() => refundPaymentConfig.validate({})).toThrow(/identifier is required/);
  });

  it('validates input: rejects non-positive amount', () => {
    expect(() => refundPaymentConfig.validate({ id: 'PAY-2026-0001', amount: 0 })).toThrow(/positive number greater than 0/);
    expect(() => refundPaymentConfig.validate({ id: 'PAY-2026-0001', amount: -100 })).toThrow(/positive number greater than 0/);
  });

  it('validates input: rejects reason shorter than 10 characters', () => {
    expect(() => refundPaymentConfig.validate({ id: 'PAY-2026-0001', reason: 'Short' })).toThrow(/at least 10 characters/);
  });

  it('reverses payment directly by payment_no and emits EVENT_TYPES.PAYMENT_REFUNDED', async () => {
    const input: RefundPaymentInput = {
      paymentId: 'PAY-2026-0001',
      amount: 2500,
      reason: 'Partial return of lens on day 2',
      clientUuid: 'action-uuid-refund-1',
    };

    const res = await refundPaymentConfig.execute(input, {
      userId: 'user-acc-1',
      role: 'Accounts',
    });

    expect(res.result.success).toBe(true);
    expect(res.result.originalPaymentId).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.result.amount).toBe(2500);
    expect(res.result.reversalNo).toMatch(/^REV-\d{4}-\d{4}$/);

    expect(db.state.inserts).toHaveLength(1);
    const insert = db.state.inserts[0]!;
    expect(insert.table).toBe('payment_reversals');
    expect(insert.row).toMatchObject({
      original_payment_id: '11111111-1111-4111-8111-111111111111',
      amount: 2500,
      reason: 'Partial return of lens on day 2',
      reversed_by: 'user-acc-1',
      approved_by: 'user-acc-1',
      client_uuid: 'action-uuid-refund-1',
    });

    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.type).toBe(EVENT_TYPES.PAYMENT_REFUNDED);
    expect(res.events[0]!.payload).toMatchObject({
      originalPaymentId: '11111111-1111-4111-8111-111111111111',
      amount: 2500,
      userId: 'user-acc-1',
    });
  });

  it('reverses payment via invoiceId lookup when called with an invoice number', async () => {
    const input: RefundPaymentInput = {
      invoiceId: 'INV-492',
    };

    const res = await refundPaymentConfig.execute(input, {
      userId: 'user-acc-1',
      role: 'Accounts',
    });

    expect(res.result.success).toBe(true);
    expect(res.result.originalPaymentId).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.result.amount).toBe(5000); // defaults to payment full amount

    expect(db.state.inserts).toHaveLength(1);
    expect(db.state.inserts[0]!.row.amount).toBe(5000);
    expect(db.state.inserts[0]!.row.reason).toContain('PAY-2026-0001');
  });

  it('rejects if no payment or invoice exists', async () => {
    await expect(
      refundPaymentConfig.execute({ id: 'NONEXISTENT' }, { userId: 'u-1', role: 'Accounts' })
    ).rejects.toThrow(/Could not find payment or invoice/);
  });
});
