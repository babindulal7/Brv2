import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type CreateDocumentInput = {
  title: string;
  docType?: string | undefined;
  relatedBookingId?: string | undefined;
};

export const createDocument = createAction<CreateDocumentInput, { success: boolean; documentId: string }>({
  name: 'CREATE_DOCUMENT',
  permissions: ['document.create'],

  validate: (input) => {
    if (!input.title) throw new Error('Document title is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    const documentId = `DOC-${Date.now().toString().slice(-4)}`;
    console.log(`[DB TX] Created document ${documentId}: ${input.title}`);

    const events = [
      {
        type: EVENT_TYPES.DOCUMENT_CREATED,
        payload: {
          documentId,
          title: input.title,
          docType: input.docType ?? 'Agreement',
          relatedBookingId: input.relatedBookingId,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, documentId },
      events,
    };
  },
});
