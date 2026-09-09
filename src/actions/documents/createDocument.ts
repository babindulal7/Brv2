import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type CreateDocumentInput = {
  title: string;
  docType?: string | undefined;
  relatedBookingId?: string | undefined;
  clientId?: string | undefined;
  documentNo?: string | undefined;
  fileUrl?: string | undefined;
  fileSizeBytes?: number | undefined;
  status?: string | undefined;
  clientUuid?: string | undefined;
};

export type CreateDocumentResult = {
  success: boolean;
  documentId: string;
  documentNo: string;
};

const VALID_DOC_TYPES = new Set([
  'Quotation',
  'Rental Agreement',
  'Packing List',
  'Delivery Note',
  'Return Report',
  'Inspection Report',
  'Damage Report',
  'Tax Invoice',
  'Receipt',
  'Credit Note',
  'Debit Note',
  'Job Card',
  'Service Report',
  'Incident Report',
  'Insurance Claim',
  'Call Sheet',
]);

export const createDocumentConfig: ActionConfig<CreateDocumentInput, CreateDocumentResult> = {
  name: 'CREATE_DOCUMENT',
  permissions: ['document.create'],
  implemented: true,

  validate: (input) => {
    if (!input.title || !input.title.trim()) {
      throw new Error('Document title is required.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    let resolvedBookingId: string | null = null;
    let resolvedClientId: string | null = input.clientId || null;

    // 1. Resolve booking if relatedBookingId provided
    if (input.relatedBookingId && input.relatedBookingId.trim()) {
      const bRef = input.relatedBookingId.trim();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, client_id, booking_no')
        .or(`id.eq.${bRef},booking_no.eq.${bRef}`)
        .maybeSingle();

      if (booking) {
        resolvedBookingId = booking.id;
        if (!resolvedClientId && booking.client_id) {
          resolvedClientId = booking.client_id;
        }
      } else {
        // Assume UUID if passed
        resolvedBookingId = bRef;
      }
    }

    // 2. Generate document_no if not provided
    let documentNo = input.documentNo?.trim();
    if (!documentNo) {
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('document_registry')
        .select('*', { count: 'exact', head: true });
      const nextSeq = (count ?? 0) + 1;
      documentNo = `DOC-${year}-${String(nextSeq).padStart(4, '0')}`;
    }

    // 3. Resolve document type
    let docType = 'Quotation';
    if (input.docType && input.docType.trim()) {
      const trimmed = input.docType.trim();
      if (VALID_DOC_TYPES.has(trimmed)) {
        docType = trimmed;
      } else if (trimmed.toLowerCase().includes('agreement')) {
        docType = 'Rental Agreement';
      } else if (trimmed.toLowerCase().includes('quote')) {
        docType = 'Quotation';
      } else if (trimmed.toLowerCase().includes('invoice')) {
        docType = 'Tax Invoice';
      }
    }

    const actionUuid = input.clientUuid || generateClientUuid();
    const fileUrl = input.fileUrl?.trim() || `/documents/${documentNo}.pdf`;
    const lifecycleStatus = input.status || 'Draft';

    const docRow = {
      client_uuid: actionUuid,
      document_no: documentNo,
      document_type: docType,
      booking_id: resolvedBookingId,
      client_id: resolvedClientId,
      lifecycle_status: lifecycleStatus,
      file_url: fileUrl,
      file_size_bytes: input.fileSizeBytes || null,
      generated_by: ctx.userId,
      created_by: ctx.userId,
    };

    const inserted = await idempotentInsert('document_registry' as never, docRow as never);
    const insertedId = (inserted as { id?: string })?.id || actionUuid;

    // 4. Link to booking_documents if booking is attached
    if (resolvedBookingId) {
      let bookingDocType: string = 'Quote';
      if (docType === 'Rental Agreement') bookingDocType = 'Rental Agreement';
      else if (docType === 'Packing List') bookingDocType = 'Packing List';
      else if (docType === 'Delivery Note') bookingDocType = 'Delivery Note';
      else if (docType === 'Tax Invoice') bookingDocType = 'Invoice';
      else if (docType === 'Receipt') bookingDocType = 'Receipt';
      else if (docType === 'Inspection Report') bookingDocType = 'Inspection Report';
      else if (docType === 'Damage Report') bookingDocType = 'Damage Report';

      await idempotentInsert('booking_documents' as never, {
        client_uuid: generateClientUuid(),
        booking_id: resolvedBookingId,
        document_id: insertedId,
        doc_type: bookingDocType,
        origin: 'Generated',
        created_by: ctx.userId,
      } as never);
    }

    const events = [
      {
        type: EVENT_TYPES.DOCUMENT_CREATED,
        payload: {
          documentId: insertedId,
          documentNo,
          title: input.title.trim(),
          docType,
          relatedBookingId: resolvedBookingId || input.relatedBookingId,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        documentId: insertedId,
        documentNo,
      },
      events,
    };
  },
};

export const createDocument = createAction<CreateDocumentInput, CreateDocumentResult>(createDocumentConfig);
