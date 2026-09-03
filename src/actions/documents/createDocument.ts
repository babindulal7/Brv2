import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { issue } from '../../data/numbering';

export type CreateDocumentInput = {
  title: string;
  docType?: string | undefined;
  relatedBookingId?: string | undefined;
};

export const createDocument = createAction<CreateDocumentInput, { success: boolean; documentId: string }>({
  name: 'CREATE_DOCUMENT',
  permissions: ['document.create'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.title) throw new Error('Document title is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    /* Prefix from Settings > Numbering, never a literal - ruling 2.2. */
    const documentId = issue('DOC', Number(Date.now().toString().slice(-4)));

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
