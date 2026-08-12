import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { validateDiscount } from '../../lib/discount';
import { issue } from '../../data/numbering';
import { idempotentInsert } from '../../lib/dataAccess';

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
  implemented: true,

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

    const { data: dbBundle } = await idempotentInsert('bundles', {
      bundle_code: generatedId,
      name: input.name,
      category_id: input.category || null,
      is_active: !input.isDraft,
      created_by: ctx.userId,
      daily_rate: 0,
      weekly_rate: 0,
    });

    if (input.items && input.items.length > 0 && dbBundle) {
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        if (!item) continue;
        await idempotentInsert('bundle_items', {
          bundle_id: dbBundle.id,
          product_id: item.modelId,
          quantity: item.qty,
          /* Law 9 — days is mandatory on every priced line, explicitly `1`,
             never by omission. The column defaults to 1, but stating it here
             means the insert cannot become silent if the default is ever
             dropped. */
          days: 1,
          sort_order: i,
          created_by: ctx.userId,
        });
      }
    }

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
