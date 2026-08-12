import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { validateDiscount } from '../../lib/discount';
import { issue } from '../../data/numbering';

export type CreateBundleItemInput = {
  modelId: string;
  qty: number;
  discountPct?: number;
  discountReason?: string;
  approvedBy?: string | null;
};

export type CreateBundleInput = {
  name: string;
  category?: string;
  items?: CreateBundleItemInput[];
  itemCount?: number;
  isDraft?: boolean;
};

export const createBundle = createAction<CreateBundleInput, { success: boolean; bundleId: string }>({
  name: 'CREATE_BUNDLE',
  permissions: ['inventory.create'],

  validate: (input) => {
    if (!input.name) throw new Error('Bundle name is required.');
    if (input.items) {
      for (const item of input.items) {
        if (item.discountPct && item.discountPct > 0) {
          const v = validateDiscount(item.discountPct, item.discountReason, item.approvedBy);
          if (!v.valid) {
            throw new Error(v.error ?? 'Invalid item discount in bundle.');
          }
        }
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /* Was `PKG-`, a fourth bundle prefix (against `BND-` in `data/bundles.ts`,
       `BND` in the registry and the ruling's `BND-`). Prefix now comes from
       `Settings ▸ Numbering` — ruling §2.2 — so there is one. */
    const generatedId = issue('BND', Number(Date.now().toString().slice(-4)));
    console.log(`[DB TX] Created bundle ${generatedId}: ${input.name} (Draft: ${!!input.isDraft}, Items: ${input.items?.length ?? 0})`);

    const events = [
      {
        type: EVENT_TYPES.BUNDLE_CREATED,
        payload: {
          bundleId: generatedId,
          name: input.name,
          itemCount: input.itemCount ?? 0,
          isDraft: !!input.isDraft,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, bundleId: generatedId },
      events,
    };
  },
});
