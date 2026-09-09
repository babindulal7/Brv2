import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mergeClientsConfig, type MergeClientsInput } from '../mergeClients';
import { EVENT_TYPES } from '../../../events/eventBus';

const access = vi.hoisted(() => {
  const state = {
    inserts: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
    updates: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid?: string | undefined; options?: unknown }>,
    supabaseUpdates: [] as Array<{ table: string; patch: Record<string, unknown>; filter: Record<string, unknown> }>,
    clients: {
      'c-survivor': {
        id: '11111111-1111-4111-8111-111111111111',
        record: { id: 'C-0001', name: 'Alpha Productions' },
        deactivatedAtAd: null as string | null,
        membershipKnown: true,
      },
      'c-duplicate': {
        id: '22222222-2222-4222-8222-222222222222',
        record: { id: 'C-0002', name: 'Alpha Media' },
        deactivatedAtAd: null as string | null,
        membershipKnown: false,
      },
    },
  };

  const queryMock = () => {
    let currentTable = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        return chain;
      },
      select: (_cols?: string, _opts?: { count?: string; head?: boolean }) => {
        return chain;
      },
      eq: (_field: string, _val: unknown) => {
        return Promise.resolve({ count: 2, error: null });
      },
      update: (patch: Record<string, unknown>) => {
        return {
          eq: (field: string, val: unknown) => {
            state.supabaseUpdates.push({
              table: currentTable,
              patch,
              filter: { [field]: val },
            });
            return Promise.resolve({ error: null });
          },
        };
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
      return { id: 'merge-record-1', ...row };
    },
    safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, clientUuid?: string, options?: unknown) => {
      state.updates.push({ table, id, patch, clientUuid, options });
      return { data: null, error: null };
    },
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: access.supabase,
}));

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: access.idempotentInsert,
  safeUpdate: access.safeUpdate,
  generateClientUuid: () => 'generated-uuid-merge-1',
}));

vi.mock('../../../lib/queries/clients', () => ({
  getClientRecord: async (ref: string) => {
    if (ref === 'C-0001' || ref === '11111111-1111-4111-8111-111111111111') {
      return access.state.clients['c-survivor'];
    }
    if (ref === 'C-0002' || ref === '22222222-2222-4222-8222-222222222222') {
      return access.state.clients['c-duplicate'];
    }
    return null;
  },
}));

describe('MERGE_CLIENTS action', () => {
  beforeEach(() => {
    access.state.inserts = [];
    access.state.updates = [];
    access.state.supabaseUpdates = [];
    access.state.clients['c-survivor'].deactivatedAtAd = null;
    access.state.clients['c-duplicate'].deactivatedAtAd = null;
  });

  it('declares implemented: true and permissions: [client.merge]', () => {
    expect(mergeClientsConfig.implemented).toBe(true);
    expect(mergeClientsConfig.permissions).toEqual(['client.merge']);
  });

  it('validates input: requires both IDs', () => {
    expect(() => mergeClientsConfig.validate({ survivorId: '', duplicateId: 'C-0002' })).toThrow(/Survivor client ID is required/);
    expect(() => mergeClientsConfig.validate({ survivorId: 'C-0001', duplicateId: '' })).toThrow(/Duplicate client ID is required/);
  });

  it('validates input: rejects identical IDs', () => {
    expect(() => mergeClientsConfig.validate({ survivorId: 'C-0001', duplicateId: 'C-0001' })).toThrow(/Cannot merge a client into itself/);
  });

  it('validates input: rejects invalid typed confirmation', () => {
    expect(() =>
      mergeClientsConfig.validate({ survivorId: 'C-0001', duplicateId: 'C-0002', typedConfirmation: 'yes' })
    ).toThrow(/Typed confirmation cannot be empty or "yes"/);

    expect(() =>
      mergeClientsConfig.validate({ survivorId: 'C-0001', duplicateId: 'C-0002', typedConfirmation: '   ' })
    ).toThrow(/Typed confirmation cannot be empty or "yes"/);
  });

  it('rejects if a client cannot be found', async () => {
    await expect(
      mergeClientsConfig.execute(
        { survivorId: 'NONEXISTENT', duplicateId: 'C-0002' },
        { userId: 'user-mgr-1', role: 'Manager' }
      )
    ).rejects.toThrow(/Survivor client 'NONEXISTENT' not found/);
  });

  it('rejects if duplicate client is already deactivated', async () => {
    access.state.clients['c-duplicate'].deactivatedAtAd = '2026-08-01T00:00:00Z';
    await expect(
      mergeClientsConfig.execute(
        { survivorId: 'C-0001', duplicateId: 'C-0002' },
        { userId: 'user-mgr-1', role: 'Manager' }
      )
    ).rejects.toThrow(/has already been deactivated or merged/);
  });

  it('rejects if survivor client is deactivated', async () => {
    access.state.clients['c-survivor'].deactivatedAtAd = '2026-08-01T00:00:00Z';
    await expect(
      mergeClientsConfig.execute(
        { survivorId: 'C-0001', duplicateId: 'C-0002' },
        { userId: 'user-mgr-1', role: 'Manager' }
      )
    ).rejects.toThrow(/is deactivated and cannot receive merged records/);
  });

  it('successfully merges duplicate into survivor, repoints tables, and logs merge record', async () => {
    const input: MergeClientsInput = {
      survivorId: 'C-0001',
      duplicateId: 'C-0002',
      clientUuid: 'action-uuid-merge-test',
    };

    const res = await mergeClientsConfig.execute(input, {
      userId: 'user-mgr-1',
      role: 'Manager',
    });

    expect(res.result.success).toBe(true);
    expect(res.result.survivorId).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.result.duplicateId).toBe('22222222-2222-4222-8222-222222222222');
    expect(res.result.movedSummary.bookings).toBe(2);

    // Verify related tables were updated to survivorId
    const repointedTables = access.state.supabaseUpdates.map((u) => u.table);
    expect(repointedTables).toContain('bookings');
    expect(repointedTables).toContain('invoices');
    expect(repointedTables).toContain('security_deposits');
    expect(repointedTables).toContain('cases');
    expect(repointedTables).toContain('client_contacts');
    expect(repointedTables).toContain('client_documents');
    expect(repointedTables).toContain('client_notes');

    for (const update of access.state.supabaseUpdates) {
      expect(update.patch.client_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(update.filter.client_id).toBe('22222222-2222-4222-8222-222222222222');
    }

    // Verify duplicate client was deactivated with merged_into_client_id
    expect(access.state.updates).toHaveLength(1);
    const clientUpdate = access.state.updates[0]!;
    expect(clientUpdate.table).toBe('clients');
    expect(clientUpdate.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(clientUpdate.patch).toMatchObject({
      status: 'Deactivated',
      merged_into_client_id: '11111111-1111-4111-8111-111111111111',
      deactivation_reason: 'Merged into C-0001',
      deactivated_by: 'user-mgr-1',
    });
    expect(clientUpdate.options).toEqual({ returnRow: false });

    // Verify client_merges row inserted
    expect(access.state.inserts).toHaveLength(1);
    const mergeInsert = access.state.inserts[0]!;
    expect(mergeInsert.table).toBe('client_merges');
    expect(mergeInsert.row).toMatchObject({
      surviving_client_id: '11111111-1111-4111-8111-111111111111',
      merged_client_id: '22222222-2222-4222-8222-222222222222',
      typed_confirmation: 'MERGE C-0002 INTO C-0001',
      created_by: 'user-mgr-1',
    });
    expect(mergeInsert.options).toEqual({ returnRow: false });

    // Verify domain event emitted
    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.type).toBe(EVENT_TYPES.CLIENT_MERGED);
    expect(res.events[0]!.payload).toMatchObject({
      survivorId: '11111111-1111-4111-8111-111111111111',
      survivorCode: 'C-0001',
      duplicateId: '22222222-2222-4222-8222-222222222222',
      duplicateCode: 'C-0002',
      userId: 'user-mgr-1',
    });
  });
});
