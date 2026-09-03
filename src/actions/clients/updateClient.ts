import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

/**
 * The write seam for inline edit on `ClientDetail`.
 *
 * `patch` carries **only the keys the operator changed** — never the whole
 * record. `useEditMode` guarantees that, and it is the guarantee that stops an
 * edit of one field silently rewriting a column nobody touched.
 *
 * Like the other 36 files under `src/actions/`, this is a stub: `implemented`
 * defaults to `false`, so the dispatcher refuses to run it rather than logging
 * `[DB TX]` and returning success for work it did not do. Set `implemented:
 * true` only once `execute` writes through `lib/dataAccess` and that write has
 * been driven, not read.
 */

export type UpdateClientInput = {
  clientId: string;
  /** Changed keys only. */
  patch: Record<string, unknown>;
};

export const updateClient = createAction<UpdateClientInput, { success: boolean }>({
  name: 'UPDATE_CLIENT',
  permissions: ['client.update'],

  validate: (input) => {
    if (!input.clientId) throw new Error('Client ID is required.');
    if (!input.patch || Object.keys(input.patch).length === 0) {
      throw new Error('Nothing to update — the patch is empty.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const events = [
      {
        type: EVENT_TYPES.CLIENT_UPDATED,
        payload: {
          clientId: input.clientId,
          /* Keys, not values. A client patch can carry PAN, phone and address;
             the event log is read by roles that `fieldGating` keeps those from. */
          changedKeys: Object.keys(input.patch),
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true },
      events,
    };
  },
});
