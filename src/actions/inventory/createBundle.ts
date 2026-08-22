import { createAction, type ActionConfig, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { validateDiscount } from '../../lib/discount';
import { idempotentInsert } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';
import { toRupees, type Paisa } from '../../lib/money';

/**
 * # CREATE_BUNDLE — the write, corrected (Phase 2 item 2.6a)
 *
 * ## What this replaced
 *
 * ```ts
 * const generatedId = issue('BND', Number(Date.now().toString().slice(-4)));
 * … idempotentInsert('bundles', { bundle_code: generatedId,
 *                                 category_id: input.category || null,
 *                                 daily_rate: 0, weekly_rate: 0, … });
 * … idempotentInsert('bundle_items', { product_id: item.modelId, … });
 * ```
 *
 * Three separate data corruptions in one body (audit:
 * `docs/pages/22_add_bundle.md` §7 gaps 2, 3, 4, 9):
 *
 *  1. `bundle_items.product_id` is `uuid not null references products (id)`
 *     (0004:411) and was handed the seed-catalogue id `'M-FX3-BODY'` verbatim.
 *  2. `bundles.category_id` is `uuid references inventory_categories (id)`
 *     (0004:386) and was handed the display name `'Camera'`.
 *  3. Every rate the screen computes was written as `daily_rate: 0,
 *     weekly_rate: 0` while the success toast quoted `formatMoney(rate)`
 *     "per day" — a figure the row did not contain.
 *  4. The code came from `issue('BND', Date.now().toString().slice(-4))` —
 *     clock digits recycled every ten seconds, against
 *     `bundles_code_key unique (bundle_code)` (0004:396).
 *
 * All four are fixed on the `createEquipment` pattern (the Phase 1 template):
 * natural keys resolve to uuids by SELECT before the first insert and refuse
 * with a named sentence when unresolvable; money crosses Paisa → rupees
 * exactly once via `toRupees()`; and the code comes from
 * `next_document_number('bundle')` — the `bundle` sequence row exists live
 * (`0056_ruled_sequences_completion.sql:71`, prefix `BND-`, padding 1,
 * year-less), so the database mints `BND-1, BND-2, …` under a row lock.
 * ⚠ MOCK DRIFT: `lib/mock/client.ts:nextDocumentNumber` has no `bundle` entry
 * in `SEQ_PREFIX`/`RULED_FORMAT`, so mock mode mints `BUNDLE-2026-0001` for
 * this key. The mock enforces no CHECK so the insert still lands; fixing the
 * shape is a mock change, outside this file (same caveat createEquipment
 * records for `EQ`).
 *
 * ## The read-back hazard this body routes around
 *
 * `0035_accessory_bundle_and_ledger_masking.sql:67` revokes
 * `select (daily_rate, weekly_rate) on bundles from authenticated` — the
 * column mask behind `bundles_v`. `idempotentInsert`'s default read-back is
 * `.insert().select().single()`, which requests every column and is therefore
 * refused on live for every session, *after* the row commits — the
 * two-permission trap `lib/dataAccess.ts:57-76` documents on `audit_events`.
 * So the insert here passes `{ returnRow: false }` and reads back only
 * `id, bundle_code` by the Law 8 key, columns the mask leaves open. That
 * narrow re-select is also the persistence check: the offline queue is
 * guarded above it, and the `'Failed to fetch'` echo branch writes nothing,
 * so a row the re-select cannot find is a row the database never confirmed.
 *
 * ## Booqable ownership
 *
 * `bundles`/`bundle_items` sit in `BOOQABLE_READ_ONLY_TABLES`, so
 * `insertViaSourceSwitch` would refuse this call. The raw `idempotentInsert`
 * is used deliberately — the same precedent `createEquipment` sets for
 * `products` (also in that set) and `createClient` documents for `clients`:
 * while the bridge is off, the OS is the writer, and the ownership tension is
 * `booqable/sync.ts`'s recorded TODO(decision), not this file's to settle.
 *
 * ## Law 6 — money
 *
 * Rates arrive as Paisa (branded ints) and cross to `numeric(14,2)` rupees
 * exactly once, here. A rate the caller did not send is ABSENT from the
 * payload — the column's own default (0) stands — never zeroed by this file.
 * Add Bundle is fully gated behind `useCanViewMoney`, so a money-blind
 * session can never reach this action with an omitted rate by masking.
 *
 * ## How the write was driven
 *
 * Through the exported `createBundleConfig` in vitest
 * (`__tests__/inventoryWrites.test.ts`), with `lib/dataAccess` and
 * `lib/supabase` mocked at the same seams the createEquipment suite uses:
 * payloads, lookups, the allocator, every refusal branch and the role denial
 * are pinned there. Not driven against live Supabase — this session may not
 * run the dev server or apply migrations.
 */

export type CreateBundleItemInput = {
  /** The seed-catalogue model id (`'M-FX3-BODY'`) — carried so a refusal can
   *  name the line; NEVER written. `bundle_items.product_id` is a uuid FK. */
  modelId: string;
  /** `products.name` — resolved to the `products.id` uuid by SELECT. */
  productName: string;
  qty: number;
  discountPct?: number;
  discountReason?: string;
  approvedBy?: string | null;
  /** Law 8 — one key per ROW, minted where the operator pressed Save. */
  clientUuid: string;
};

export type CreateBundleInput = {
  /** Law 8 — the `bundles` row key, minted at the call site, stable across retries. */
  clientUuid: string;
  name: string;
  /** `inventory_categories.name` — resolved to `category_id` by SELECT.
   *  Absent (a draft may lack one) → `category_id` stays NULL. */
  category?: string;
  description?: string;
  items?: CreateBundleItemInput[];
  itemCount?: number;
  isDraft?: boolean;
  /* Law 6 — Paisa in, rupees at the boundary, exactly once. */
  dailyRatePaisa?: Paisa;
  weeklyRatePaisa?: Paisa;
};

export type CreateBundleResult = {
  /** `bundles.id` — Postgres', never a client-side string. */
  bundleId: string;
  /** `bundles.bundle_code` — allocated by `next_document_number('bundle')`. */
  bundleCode: string;
  itemCount: number;
};

/** The exact `bundles` column set this action writes — typechecked against
 *  0004:380-398, the same defence `createEquipment` keeps against the stale
 *  hand-written `Database` type. */
type BundleInsertPayload = {
  client_uuid: string;
  bundle_code: string;
  name: string;
  description: string | null;
  category_id?: string;
  is_active: boolean;
  daily_rate?: number;
  weekly_rate?: number;
  created_by: string;
};

type BundleItemInsertPayload = {
  client_uuid: string;
  bundle_id: string;
  product_id: string;
  quantity: number;
  /* Law 9 — days is mandatory on every priced line, explicitly `1`, never by
     omission. The column defaults to 1, but stating it here means the insert
     cannot become silent if the default is ever dropped. */
  days: number;
  sort_order: number;
  created_by: string;
};

/** Trimmed, or null — a blank optional column is NULL, never an empty string. */
function orNull(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Present-and-converted, or absent — `exactOptionalPropertyTypes` is on, and
 *  a rate the caller did not send must be ABSENT from the payload. */
function moneyCol(key: string, paisa: Paisa | null | undefined): Record<string, number> {
  return paisa == null ? {} : { [key]: Number(toRupees(paisa).toFixed(2)) };
}

/** Turn a Postgres failure into a sentence an operator can act on. Constraint
 *  names below are live on the project (0004); unmatched messages pass through. */
function describeBundleInsertFailure(message: string, bundleCode: string): string {
  if (message.includes('bundles_code_key')) {
    return (
      `The database allocated bundle code ${bundleCode} and a bundle already carries it — the 'bundle' ` +
      `number sequence is behind the codes already in the table. Nothing was saved. This needs the ` +
      `sequence corrected, not a retry.`
    );
  }
  if (message.includes('bundles_category_id_fkey') || message.includes('category_id')) {
    return `The chosen category no longer exists in inventory_categories, so nothing was saved.`;
  }
  return message;
}

export const createBundleConfig: ActionConfig<CreateBundleInput, CreateBundleResult> = {
  name: 'CREATE_BUNDLE',
  permissions: ['inventory.create'],

  /**
   * `true` because `execute` inserts through `lib/dataAccess.idempotentInsert`
   * and verifies the row against the store by re-selecting its id. See the
   * header for how the write was driven.
   */
  implemented: true,

  validate: (input) => {
    if (!input.name || input.name.trim() === '') {
      throw new Error('Bundle name is required — bundles.name is NOT NULL.');
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This bundle carries no idempotency key, so a retry could create a second bundle under a second ' +
          'code. Nothing was sent. (Law 8)',
      );
    }
    if (input.items) {
      for (const [i, item] of input.items.entries()) {
        if (!item.clientUuid || item.clientUuid.trim() === '') {
          throw new Error(
            `Line ${i + 1} carries no idempotency key — Law 8 wants one per row, minted where the operator ` +
              `acted. Nothing was sent.`,
          );
        }
        if (!Number.isFinite(item.qty) || item.qty < 1) {
          throw new Error(
            `Line ${i + 1} has a quantity below 1 — bundle_items_qty_positive refuses it (0004:420).`,
          );
        }
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
    /* OFFLINE — refused, not queued: the bundle code comes from the database's
       allocator and cannot be issued here. Same reasoning, same shape as
       createClient / createEquipment. */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. A new bundle is not queued for later — the bundle code comes from the ' +
          'database and cannot be issued here. Save it when you are back online.',
      );
    }

    /* Natural keys → uuids, all BEFORE the first insert so a resolution
       failure writes nothing at all. */
    let categoryId: string | null = null;
    const categoryName = input.category?.trim() ?? '';
    if (categoryName) {
      const { data: categoryRow, error: categoryError } = await supabase
        .from('inventory_categories')
        .select('id, name')
        .eq('name', categoryName)
        .maybeSingle();
      if (categoryError) {
        throw new Error(`Could not look up the category, so nothing was saved: ${categoryError.message}`);
      }
      if (!categoryRow) {
        throw new Error(
          `"${categoryName}" is not a category in inventory_categories, so nothing was saved. ` +
            `bundles.category_id is a uuid FK (0004:386), and the Add Bundle category list is a seed ` +
            `constant — the two catalogues are different universes (docs/pages/22_add_bundle.md gap 3). ` +
            `Pick a category that exists in the database.`,
        );
      }
      categoryId = (categoryRow as { id: string }).id;
    }

    const items = input.items ?? [];
    const resolvedItems: Array<{ productId: string; qty: number; clientUuid: string }> = [];
    for (const item of items) {
      const productName = item.productName?.trim() ?? '';
      const { data: productRow, error: productError } = await supabase
        .from('products')
        .select('id, name')
        .eq('name', productName)
        .maybeSingle();
      if (productError) {
        throw new Error(
          `Could not look up "${productName || item.modelId}" in products, so nothing was saved: ${productError.message}`,
        );
      }
      if (!productRow) {
        throw new Error(
          `"${productName || item.modelId}" (${item.modelId}) is not a product in the products table, so ` +
            `nothing was saved. bundle_items.product_id is a uuid FK to products (0004:411), and the Add ` +
            `Bundle inventory tree is a seed catalogue — the two are different universes ` +
            `(docs/pages/22_add_bundle.md gap 2). Only lines that match a real product can be saved.`,
        );
      }
      resolvedItems.push({
        productId: (productRow as { id: string }).id,
        qty: item.qty,
        clientUuid: item.clientUuid,
      });
    }

    /* The code from the database's allocator, never from the clock. A retry
       re-enters the RPC before the insert, so a Law 8 replay that conflicts on
       client_uuid has burned a sequence value — gaps are possible and are not
       a defect (same caveat as createClient / createEquipment). */
    const { data: bundleCode, error: numberError } = await supabase.rpc('next_document_number', {
      p_sequence_key: 'bundle',
    });
    if (numberError) {
      throw new Error(`Could not allocate a bundle code, so nothing was saved: ${numberError.message}`);
    }
    if (!bundleCode) {
      throw new Error('next_document_number returned no bundle code, so nothing was saved.');
    }

    const payload: BundleInsertPayload = {
      client_uuid: input.clientUuid,
      bundle_code: bundleCode as string,
      name: input.name.trim(),
      description: orNull(input.description),
      ...(categoryId ? { category_id: categoryId } : {}),
      is_active: !input.isDraft,
      /* Law 6 — the screen-computed rate the operator saw, in rupees, exactly
         once. Absent stays absent; the column default (0) is then the
         database's statement, not this file's fabrication. */
      ...moneyCol('daily_rate', input.dailyRatePaisa),
      ...moneyCol('weekly_rate', input.weeklyRatePaisa),
      created_by: ctx.userId,
    };

    try {
      /* `'bundles' as never` / `payload as never` — the sanctioned cast from
         createClient.ts / createEquipment.ts: `dataAccess` is generic over the
         hand-written `types/database.ts`, and `BundleInsertPayload` above is
         what actually typechecks the payload against 0004.
         `{ returnRow: false }` because 0035:67 revokes select on the two money
         columns and the default read-back requests every column — see the
         header. */
      await idempotentInsert('bundles' as never, payload as never, { returnRow: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(describeBundleInsertFailure(message, bundleCode as string));
    }

    /* ── PERSISTENCE CHECK ──────────────────────────────────────────────────
     * The narrow re-select by the Law 8 key, requesting only columns the 0035
     * mask leaves open. This is the only proof the row committed: with
     * `returnRow: false` the insert reports nothing back, and the network-echo
     * branch of `idempotentInsert` "succeeds" having written nothing. It also
     * makes a Law 8 replay land correctly — the conflict re-resolves to the
     * bundle the first press created. */
    const { data: savedBundle, error: readbackError } = await supabase
      .from('bundles')
      .select('id, bundle_code')
      .eq('client_uuid', input.clientUuid)
      .maybeSingle();
    if (readbackError) {
      throw new Error(
        `The bundle could not be confirmed against the database, so treat it as not saved: ${readbackError.message}`,
      );
    }
    const bundle = savedBundle as { id?: string; bundle_code?: string } | null;
    if (!bundle || typeof bundle.id !== 'string') {
      throw new Error(
        'The bundle was queued rather than written — the database has not confirmed it, so it has no ' +
          'bundle code yet. Check the connection and save it again.',
      );
    }

    const savedCode = bundle.bundle_code ?? (bundleCode as string);

    /* Lines — one row each, each under its own Law 8 key, carrying the
       RESOLVED product uuid. */
    let writtenItems = 0;
    for (const [i, item] of resolvedItems.entries()) {
      const itemPayload: BundleItemInsertPayload = {
        client_uuid: item.clientUuid,
        bundle_id: bundle.id,
        product_id: item.productId,
        quantity: item.qty,
        days: 1,
        sort_order: i,
        created_by: ctx.userId,
      };
      try {
        const itemResult = await idempotentInsert('bundle_items' as never, itemPayload as never);
        const savedItem = itemResult.data as unknown as { id?: string } | null;
        if (itemResult.error || !savedItem || typeof savedItem.id !== 'string') {
          throw new Error('the database did not confirm the row');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `The bundle WAS created as ${savedCode} (${writtenItems} of ${resolvedItems.length} line${
            resolvedItems.length === 1 ? '' : 's'
          } written), but line ${i + 1} failed: ${message}. Fix the line and save again — the same form ` +
            `resubmitted resolves to the same bundle instead of creating a second one (Law 8).`,
        );
      }
      writtenItems += 1;
    }

    const events = [
      {
        type: EVENT_TYPES.BUNDLE_CREATED,
        payload: {
          bundleId: bundle.id,
          bundleCode: savedCode,
          name: input.name.trim(),
          itemCount: input.itemCount ?? writtenItems,
          isDraft: !!input.isDraft,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { bundleId: bundle.id, bundleCode: savedCode, itemCount: writtenItems },
      events,
    };
  },
};

export const createBundle = createAction(createBundleConfig);
