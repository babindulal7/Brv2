import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDocumentConfig, type CreateDocumentInput } from '../createDocument';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', booking_no: 'B-2026-0001', client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    ],
    docCount: 0,
    inserts: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
  };

  const queryMock = () => {
    let currentTable = '';
    let orCondition = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        orCondition = '';
        return chain;
      },
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head) {
          return Promise.resolve({ count: state.docCount, error: null });
        }
        return chain;
      },
      or: (condition: string) => {
        orCondition = condition;
        return chain;
      },
      maybeSingle: async () => {
        if (currentTable === 'bookings') {
          const match = state.bookings.find(
            (b) => orCondition && (orCondition.includes(b.id) || orCondition.includes(b.booking_no))
          );
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
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
      if (table === 'document_registry') state.docCount++;
      return { id: 'doc-row-uuid-1', ...row };
    },
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}));

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: db.idempotentInsert,
  generateClientUuid: () => 'generated-client-uuid-doc',
}));

describe('CREATE_DOCUMENT action', () => {
  beforeEach(() => {
    db.state.inserts = [];
    db.state.docCount = 0;
  });

  it('declares implemented: true and permissions: [document.create]', () => {
    expect(createDocumentConfig.implemented).toBe(true);
    expect(createDocumentConfig.permissions).toEqual(['document.create']);
  });

  it('validates input: requires title', () => {
    expect(() => createDocumentConfig.validate({ title: '' })).toThrow(/Document title is required/);
    expect(() => createDocumentConfig.validate({ title: '   ' })).toThrow(/Document title is required/);
  });

  it('creates standalone document and emits EVENT_TYPES.DOCUMENT_CREATED', async () => {
    const input: CreateDocumentInput = {
      title: 'Commercial Film Production Quotation',
      docType: 'Quotation',
      clientUuid: 'action-uuid-doc-1',
    };

    const res = await createDocumentConfig.execute(input, {
      userId: 'desk-user-1',
      role: 'Coordinator',
    });

    expect(res.result.success).toBe(true);
    expect(res.result.documentNo).toMatch(/^DOC-\d{4}-\d{4}$/);

    expect(db.state.inserts).toHaveLength(1);
    const insert = db.state.inserts[0]!;
    expect(insert.table).toBe('document_registry');
    expect(insert.row).toMatchObject({
      document_type: 'Quotation',
      lifecycle_status: 'Draft',
      created_by: 'desk-user-1',
      client_uuid: 'action-uuid-doc-1',
    });

    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.type).toBe(EVENT_TYPES.DOCUMENT_CREATED);
    expect(res.events[0]!.payload).toMatchObject({
      title: 'Commercial Film Production Quotation',
      docType: 'Quotation',
      userId: 'desk-user-1',
    });
  });

  it('creates document linked to a booking and registers in booking_documents', async () => {
    const input: CreateDocumentInput = {
      title: 'Rental Agreement for Alexa Mini Package',
      docType: 'Rental Agreement',
      relatedBookingId: 'B-2026-0001',
    };

    const res = await createDocumentConfig.execute(input, {
      userId: 'desk-user-1',
      role: 'Coordinator',
    });

    expect(res.result.success).toBe(true);
    expect(db.state.inserts).toHaveLength(2);

    const docInsert = db.state.inserts[0]!;
    expect(docInsert.table).toBe('document_registry');
    expect(docInsert.row.booking_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(docInsert.row.client_id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(docInsert.row.document_type).toBe('Rental Agreement');

    const linkInsert = db.state.inserts[1]!;
    expect(linkInsert.table).toBe('booking_documents');
    expect(linkInsert.row.booking_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(linkInsert.row.doc_type).toBe('Rental Agreement');
    expect(linkInsert.row.origin).toBe('Generated');
  });
});
