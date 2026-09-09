import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, safeUpdate, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';
import { getClientRecord } from '../../lib/queries/clients';

export type MergeClientsInput = {
  /** UUID or client_code of the surviving client */
  survivorId: string;
  /** UUID or client_code of the duplicate client to be merged and deactivated */
  duplicateId: string;
  /** Optional custom typed confirmation word/phrase (cannot be empty or 'yes') */
  typedConfirmation?: string;
  /** Optional Law 8 idempotency key */
  clientUuid?: string;
};

export type MergeClientsResult = {
  success: boolean;
  survivorId: string;
  duplicateId: string;
  movedSummary: {
    bookings: number;
    invoices: number;
    security_deposits: number;
    cases: number;
    contacts: number;
    documents: number;
    notes: number;
  };
};

export const mergeClientsConfig: ActionConfig<MergeClientsInput, MergeClientsResult> = {
  name: 'MERGE_CLIENTS',
  permissions: ['client.merge'],
  implemented: true,

  validate: (input) => {
    if (!input.survivorId || !input.survivorId.trim()) {
      throw new Error('Survivor client ID is required.');
    }
    if (!input.duplicateId || !input.duplicateId.trim()) {
      throw new Error('Duplicate client ID is required.');
    }
    if (input.survivorId.trim() === input.duplicateId.trim()) {
      throw new Error('Cannot merge a client into itself.');
    }
    if (input.typedConfirmation !== undefined) {
      const trimmed = input.typedConfirmation.trim().toLowerCase();
      if (!trimmed || trimmed === 'yes') {
        throw new Error('Typed confirmation cannot be empty or "yes".');
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawSurvivor = input.survivorId.trim();
    const rawDuplicate = input.duplicateId.trim();

    // 1. Resolve both clients
    const [survivorProfile, duplicateProfile] = await Promise.all([
      getClientRecord(rawSurvivor),
      getClientRecord(rawDuplicate),
    ]);

    if (!survivorProfile) {
      throw new Error(`Survivor client '${rawSurvivor}' not found.`);
    }
    if (!duplicateProfile) {
      throw new Error(`Duplicate client '${rawDuplicate}' not found.`);
    }

    const survivorId = survivorProfile.id;
    const duplicateId = duplicateProfile.id;

    if (survivorId === duplicateId) {
      throw new Error('Cannot merge a client into itself.');
    }

    if (survivorProfile.deactivatedAtAd) {
      throw new Error(`Survivor client '${survivorProfile.record.id}' is deactivated and cannot receive merged records.`);
    }
    if (duplicateProfile.deactivatedAtAd) {
      throw new Error(`Duplicate client '${duplicateProfile.record.id}' has already been deactivated or merged.`);
    }

    // 2. Count and repoint related records
    // Bookings
    const { count: bookingsCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((bookingsCount ?? 0) > 0) {
      await supabase.from('bookings').update({ client_id: survivorId }).eq('client_id', duplicateId);
    }

    // Invoices
    const { count: invoicesCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((invoicesCount ?? 0) > 0) {
      await supabase.from('invoices').update({ client_id: survivorId }).eq('client_id', duplicateId);
    }

    // Security Deposits
    const { count: depositsCount } = await supabase
      .from('security_deposits')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((depositsCount ?? 0) > 0) {
      await supabase.from('security_deposits').update({ client_id: survivorId }).eq('client_id', duplicateId);
    }

    // Cases
    const { count: casesCount } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((casesCount ?? 0) > 0) {
      await supabase.from('cases').update({ client_id: survivorId }).eq('client_id', duplicateId);
    }

    // Contacts: repoint, set is_primary = false so survivor keeps its own primary contact
    const { count: contactsCount } = await supabase
      .from('client_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((contactsCount ?? 0) > 0) {
      await supabase.from('client_contacts').update({ client_id: survivorId, is_primary: false }).eq('client_id', duplicateId);
    }

    // Documents
    const { count: documentsCount } = await supabase
      .from('client_documents')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((documentsCount ?? 0) > 0) {
      await supabase.from('client_documents').update({ client_id: survivorId }).eq('client_id', duplicateId);
    }

    // Notes
    const { count: notesCount } = await supabase
      .from('client_notes')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', duplicateId);
    if ((notesCount ?? 0) > 0) {
      await supabase.from('client_notes').update({ client_id: survivorId }).eq('client_id', duplicateId);
    }

    const movedSummary = {
      bookings: bookingsCount ?? 0,
      invoices: invoicesCount ?? 0,
      security_deposits: depositsCount ?? 0,
      cases: casesCount ?? 0,
      contacts: contactsCount ?? 0,
      documents: documentsCount ?? 0,
      notes: notesCount ?? 0,
    };

    // 3. Deactivate the duplicate client
    const now = new Date().toISOString();
    const actionUuid = input.clientUuid || generateClientUuid();

    await safeUpdate(
      'clients' as never,
      duplicateId,
      {
        status: 'Deactivated',
        deactivated_at: now,
        deactivated_by: ctx.userId,
        deactivation_reason: `Merged into ${survivorProfile.record.id}`,
        merged_into_client_id: survivorId,
        updated_at: now,
      } as never,
      actionUuid,
      { returnRow: false }
    );

    // 4. Insert audit record in client_merges
    const confirmation = input.typedConfirmation?.trim() || `MERGE ${duplicateProfile.record.id} INTO ${survivorProfile.record.id}`;
    const mergeRow = {
      client_uuid: actionUuid,
      surviving_client_id: survivorId,
      merged_client_id: duplicateId,
      typed_confirmation: confirmation,
      moved_summary: movedSummary,
      created_by: ctx.userId,
    };

    await idempotentInsert('client_merges' as never, mergeRow as never, { returnRow: false });

    // 5. Emit domain event
    const events = [
      {
        type: EVENT_TYPES.CLIENT_MERGED,
        payload: {
          survivorId,
          survivorCode: survivorProfile.record.id,
          duplicateId,
          duplicateCode: duplicateProfile.record.id,
          movedSummary,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        survivorId,
        duplicateId,
        movedSummary,
      },
      events,
    };
  },
};

export const mergeClients = createAction<MergeClientsInput, MergeClientsResult>(mergeClientsConfig);
