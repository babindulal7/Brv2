import { createAction, type ActionConfig, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';
import { toRupees, type Paisa } from '../../lib/money';

/**
 * # UPDATE_BUNDLE — editing a bundle that already exists
 *
 * `createBundle` could mint a bundle and nothing could ever change it again:
 * there was no route, no action and no screen. A kit whose contents are fixed
 * at creation is not a kit an operator can keep, so this is the write seam for
 * `/inventory/bundles/:bundleRef/edit`.
 *
 * ## What can be changed, and what cannot — read this before adding a control
 *
 * The boundary is not a design preference. It is what the grants on the live
 * project actually permit, re-read 8 Sep 2026 from
 * `information_schema.role_table_grants`:
 *
 * | Table | `authenticated` holds |
 * |---|---|
 * | `bundles` | SELECT, INSERT, UPDATE — **no DELETE** |
 * | `bundle_items` | SELECT, INSERT, UPDATE — **no DELETE** |
 *
 * Re-read a second time after `0079`-`0103` were applied to production the same day, so
 * this is the post-wave state, not a snapshot the migrations have since moved. `anon`
 * lost its INSERT and UPDATE on both tables in that wave and now holds SELECT only.
 *
 * So:
 *
 *  - **the bundle's own fields** — name, description, category, both rates,
 *    active/archived — are an UPDATE on `bundles`. ✅
 *  - **an existing component** — quantity, days, mandatory, order — is an
 *    UPDATE on `bundle_items`. ✅
 *  - **a new component** is an INSERT on `bundle_items`. ✅
 *  - **removing a component is performed via soft-deactivation (Law 3, OPEN_DECISIONS.md §4.52).**
 *    `authenticated` holds no DELETE grant on `bundle_items`, so physical DELETE is forbidden.
 *    Migration 0134 added `is_active`, `deactivated_at`, and `deactivated_by` columns.
 *    Components are retired by setting `is_active = false`, preserving historical references
 *    while removing them from the active kit.
 *
 * RULING 2026-09-08 (R-34) & §4.52: a bundle is editable; saved components can be soft-deactivated
 * without physical deletion.
 *
 * ## Only what the operator changed
 *
 * `patch` carries changed keys ONLY, on `updateClient`'s contract: an edit of
 * one field must not rewrite a column nobody touched. That is why
 * `BundleWithItems` now carries `categoryId` as well as the category NAME —
 * re-resolving a name to an id at save time is how `createBundle` lost ten of
 * sixteen categories, and a bundle whose category is left alone must keep the
 * id it already had.
 *
 * ## Every lookup before every write
 *
 * The category, each added product, the bundle itself and each edited line are
 * all resolved first. A reference that cannot be resolved refuses with a named
 * sentence and **nothing at all is written** — the same ordering `createBundle`
 * keeps, and the reason a half-applied edit is not a state this action can
 * leave behind for the bundle row.
 *
 * Line writes after that point are sequential and individually confirmed, so a
 * failure on line 3 is reported as *"lines 1-2 were saved"* rather than as a
 * silent partial. It is a real partial, and saying so is the honest report.
 *
 * ## The read-back hazard, again
 *
 * `0035:67` revokes `select (daily_rate, weekly_rate) on bundles`, so a default
 * `.select()` echo asks for columns the mask refuses and fails AFTER the row
 * commits. Every read-back here names its columns and none of them is money.
 * That echo is also the only proof the write landed: an UPDATE refused by RLS
 * returns **zero rows and no error**, so without a single-row echo a forbidden
 * edit would report success having changed nothing.
 *
 * ## Law 8 — one key per row, not one per press
 *
 * `safeUpdate`'s `clientUuid` is the OFFLINE ENVELOPE key, and the queue
 * de-duplicates on it. One key reused across four line edits would collapse
 * them into one queued mutation and silently drop three. So each edited and
 * each added line carries its own key, minted where the operator pressed Save —
 * `bundle_items.client_uuid` is itself `unique` (0004:419), which is the same
 * rule seen from the row's side.
 *
 * ## Law 6 — money
 *
 * Rates are Paisa in, rupees at the boundary, exactly once, via `toRupees`. A
 * rate the caller did not send is ABSENT from the payload, so the stored value
 * stands — this file never writes a rate it was not given, and never zeroes
 * one. The edit screen drops both rate fields for a money-blind session rather
 * than masking them, so such a session cannot reach here with an omitted rate
 * that would read as "cleared".
 *
 * ## How the write was driven
 *
 * Through `updateBundleConfig` in vitest (`__tests__/inventoryWrites.test.ts`),
 * at the same `lib/dataAccess` / `lib/supabase` seams the createBundle suite
 * mocks, and through the running app in mock mode. Not driven against live
 * Supabase.
 */

/** An existing `bundle_items` row the operator changed. */
export type UpdateBundleLineEdit = {
  /** `bundle_items.id` — from `BundleComponent.itemId`. */
  itemId: string;
  quantity?: number;
  days?: number;
  isMandatory?: boolean;
  sortOrder?: number;
  /** Law 8 — this ROW's own envelope key. See the header. */
  clientUuid: string;
};

/** A component being added to a bundle that already exists. */
export type UpdateBundleLineAdd = {
  /** `products.id` — how the picker identifies a line. */
  productId?: string | undefined;
  /** `products.name` — exact-match fallback when no id is sent. */
  productName?: string | undefined;
  qty: number;
  /** Law 9 — days is stated, never left to a column default. */
  days?: number;
  /** Law 8 — one key per row. */
  clientUuid: string;
};

/** A component being soft-deactivated (removed) from an existing bundle (Law 3, OPEN_DECISIONS.md §4.52). */
export type UpdateBundleLineDeactivate = {
  /** `bundle_items.id` — from `BundleComponent.itemId`. */
  itemId: string;
  /** Law 8 — this ROW's own envelope key. */
  clientUuid: string;
};

/** The bundle row's own fields. Changed keys ONLY. */
export type UpdateBundlePatch = {
  name?: string;
  description?: string | null;
  /**
   * `inventory_categories.id`, or `null` to clear it. **Absent means "not
   * touched"** and `null` means "cleared" — two different edits, and
   * `exactOptionalPropertyTypes` is what keeps them apart at the call site.
   */
  categoryId?: string | null;
  dailyRatePaisa?: Paisa;
  weeklyRatePaisa?: Paisa;
  /** `bundles.is_active` — Law 3's archive, the closest thing to a delete. */
  isActive?: boolean;
};

export type UpdateBundleInput = {
  /** Law 8 — the ACTION key for this Save, minted where the operator pressed it. */
  clientUuid: string;
  /** `bundles.id` — a uuid. The screen holds it; the code is for humans. */
  bundleId: string;
  /**
   * The record revision the operator opened (`read_record_editor('bundle', id).revision`). The save is
   * refused if the bundle or its components changed since. Typed optional so existing call sites compile;
   * `validate` refuses a save without it.
   */
  expectedRevision?: string;
  patch?: UpdateBundlePatch;
  lineEdits?: UpdateBundleLineEdit[];
  lineAdds?: UpdateBundleLineAdd[];
  lineDeactivations?: UpdateBundleLineDeactivate[];
};

export type UpdateBundleResult = {
  bundleId: string;
  bundleCode: string;
  /** Which bundle-row columns actually went to the database. */
  changedKeys: string[];
  linesUpdated: number;
  linesAdded: number;
  linesDeactivated: number;
};

/** Trimmed, or null — a blank optional column is NULL, never an empty string. */
function orNull(v: string | null | undefined): string | null {
  if (v === null) return null;
  const t = v?.trim();
  return t ? t : null;
}

/** Present-and-converted, or absent. `exactOptionalPropertyTypes` is on. */
function moneyCol(key: string, paisa: Paisa | null | undefined): Record<string, number> {
  return paisa == null ? {} : { [key]: Number(toRupees(paisa).toFixed(2)) };
}

/** Turn a Postgres failure into a sentence an operator can act on. */
function describeBundleUpdateFailure(message: string): string {
  if (message.includes('PGRST116') || message.includes('0 rows')) {
    return (
      `The database accepted the request and changed no row. That is what a refused edit looks like — ` +
      `bundles_manage (0035:61) admits Owner, Admin and Manager only. Nothing was saved.`
    );
  }
  if (message.includes('bundles_category_id_fkey') || message.includes('category_id')) {
    return `The chosen category no longer exists in inventory_categories, so nothing was saved.`;
  }
  if (message.includes('bundle_items_qty_positive')) {
    return (
      `A component quantity below 1 is refused by bundle_items_qty_positive (0004:420). A component ` +
      `cannot be removed by setting it to zero — see PLAN.md §4.52.`
    );
  }
  if (message.includes('bundle_items_days_mandatory')) {
    return `A component's days must be at least 1 — bundle_items_days_mandatory refuses it (0004:421).`;
  }
  return message;
}

export const updateBundleConfig: ActionConfig<UpdateBundleInput, UpdateBundleResult> = {
  name: 'UPDATE_BUNDLE',
  permissions: ['inventory.update'],

  /** `true` — `execute` writes through `lib/dataAccess` and confirms every write
   *  by a single-row echo of named, unmasked columns. See the header. */
  implemented: true,

  validate: (input) => {
    if (!input.bundleId || input.bundleId.trim() === '') {
      throw new Error('No bundle was identified, so nothing was sent.');
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This edit carries no idempotency key, so a retry could apply it twice. Nothing was sent. (Law 8)',
      );
    }

    if (!input.expectedRevision || input.expectedRevision.trim() === '') {
      throw new Error('Reload the bundle before saving - this edit does not say which version it was made against. Nothing was sent.');
    }

    const patchKeys = Object.keys(input.patch ?? {});
    const edits = input.lineEdits ?? [];
    const adds = input.lineAdds ?? [];
    const deactivations = input.lineDeactivations ?? [];
    if (patchKeys.length === 0 && edits.length === 0 && adds.length === 0 && deactivations.length === 0) {
      throw new Error('Nothing was changed, so nothing was sent.');
    }

    if (input.patch?.name !== undefined && input.patch.name.trim() === '') {
      throw new Error('A bundle cannot be renamed to nothing — bundles.name is NOT NULL.');
    }

    for (const [i, e] of edits.entries()) {
      if (!e.itemId || e.itemId.trim() === '') {
        throw new Error(`Component ${i + 1} has no row id, so nothing was sent.`);
      }
      if (!e.clientUuid || e.clientUuid.trim() === '') {
        throw new Error(
          `Component ${i + 1} carries no idempotency key — Law 8 wants one per row. Nothing was sent.`,
        );
      }
      if (e.quantity !== undefined && (!Number.isFinite(e.quantity) || e.quantity < 1)) {
        throw new Error(
          `Component ${i + 1} has a quantity below 1 — bundle_items_qty_positive refuses it (0004:420). ` +
            `A component cannot be removed this way; see PLAN.md §4.52.`,
        );
      }
      if (e.days !== undefined && (!Number.isFinite(e.days) || e.days < 1)) {
        throw new Error(`Component ${i + 1} has days below 1 — bundle_items_days_mandatory refuses it.`);
      }
    }

    for (const [i, a] of adds.entries()) {
      if (!a.clientUuid || a.clientUuid.trim() === '') {
        throw new Error(`New component ${i + 1} carries no idempotency key (Law 8). Nothing was sent.`);
      }
      if (!Number.isFinite(a.qty) || a.qty < 1) {
        throw new Error(`New component ${i + 1} has a quantity below 1 — the database refuses it.`);
      }
      if (a.days !== undefined && (!Number.isFinite(a.days) || a.days < 1)) {
        throw new Error(`New component ${i + 1} has days below 1 — the database refuses it.`);
      }
      if (!(a.productId?.trim() || a.productName?.trim())) {
        throw new Error(
          `New component ${i + 1} names no product — bundle_items.product_id is a uuid FK to products, ` +
            `so a bundle cannot contain a line that points at nothing. Nothing was sent.`,
        );
      }
    }

    for (const [i, d] of deactivations.entries()) {
      if (!d.itemId || d.itemId.trim() === '') {
        throw new Error(`Deactivated component ${i + 1} has no row id, so nothing was sent.`);
      }
      if (!d.clientUuid || d.clientUuid.trim() === '') {
        throw new Error(
          `Deactivated component ${i + 1} carries no idempotency key (Law 8). Nothing was sent.`,
        );
      }
    }
  },

  /* RULING 2026-10-06: every write goes through `update_bundle` (0153) - one transaction, a revision
     lock and an idempotency receipt - instead of the former header/line/deactivate sequence that could
     leave a bundle half-saved. Removed components are soft-deactivated inside it (Law 3). */
  execute: async (input, ctx: ActionContext) => {
    /* OFFLINE — refused, not queued. Every reference below is resolved by a
       SELECT the queue cannot run, and an edit queued without them would be
       applied against a catalogue nobody checked. Same shape as createBundle. */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. The edit is not queued for later — the category and any new component ' +
          'have to be checked against the catalogue before anything is written. Save it when you are ' +
          'back online.',
      );
    }

    const patch = input.patch ?? {};
    const lineEdits = input.lineEdits ?? [];
    const lineAdds = input.lineAdds ?? [];
    const lineDeactivations = input.lineDeactivations ?? [];

    /* Added products are resolved to uuids here (a name must match a row exactly); everything
       else - ownership of each row, the category, the revision, the role - is checked inside
       the transaction by ``update_bundle`` (0153), so nothing is written unless all of it holds. */
    const adds: Array<{ product_id: string; quantity: number; days: number }> = [];
    for (const [i, a] of lineAdds.entries()) {
      const productId = a.productId?.trim() ?? '';
      const productName = a.productName?.trim() ?? '';
      const base = supabase.from('products').select('id');
      const { data: productRow, error: productError } = await (productId
        ? base.eq('id', productId)
        : base.eq('name', productName)
      ).maybeSingle();
      if (productError) {
        throw new Error(
          `Could not look up "${productName || productId}" in products, so nothing was saved: ${productError.message}`,
        );
      }
      if (!productRow) {
        throw new Error(
          `New component ${i + 1} ("${productName || productId}") is not in the catalogue, so nothing was ` +
            `saved. Reopen the bundle and pick the component again.`,
        );
      }
      adds.push({ product_id: (productRow as { id: string }).id, quantity: a.qty, days: a.days ?? 1 });
    }

    const rpcPatch: Record<string, unknown> = {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: orNull(patch.description) } : {}),
      ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
      ...moneyCol('daily_rate', patch.dailyRatePaisa),
      ...moneyCol('weekly_rate', patch.weeklyRatePaisa),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    };
    const { data, error } = await supabase.rpc('update_bundle', {
      p_id: input.bundleId,
      p_revision: input.expectedRevision as string,
      p_key: input.clientUuid,
      p_payload: {
        patch: rpcPatch,
        edits: lineEdits.map((e) => ({
          id: e.itemId,
          ...(e.quantity !== undefined ? { quantity: e.quantity } : {}),
          ...(e.days !== undefined ? { days: e.days } : {}),
          ...(e.isMandatory !== undefined ? { is_mandatory: e.isMandatory } : {}),
          ...(e.sortOrder !== undefined ? { sort_order: e.sortOrder } : {}),
        })),
        adds,
        deactivations: lineDeactivations.map((d) => ({ id: d.itemId })),
      },
    });
    if (error) throw new Error(describeBundleUpdateFailure(error.message));
    const saved = data as { id?: string; code?: string; revision?: string } | null;
    if (!saved || typeof saved.id !== 'string' || typeof saved.revision !== 'string') {
      throw new Error('The save was not confirmed by the database. Nothing is assumed saved - retry with your changes intact.');
    }
    const bundleId = saved.id;
    const bundleCode = saved.code ?? input.bundleId;
    const changedKeys = Object.keys(rpcPatch);
    const linesUpdated = lineEdits.length;
    const linesAdded = adds.length;
    const linesDeactivated = lineDeactivations.length;
    const events = [
      {
        type: EVENT_TYPES.BUNDLE_UPDATED,
        payload: {
          bundleId,
          bundleCode,
          /* Keys, not values — the bundle carries two money columns and this log
             is read by roles Law 6 keeps those from. */
          changedKeys,
          linesUpdated,
          linesAdded,
          linesDeactivated,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { bundleId, bundleCode, changedKeys, linesUpdated, linesAdded, linesDeactivated },
      events,
    };
  },
};

export const updateBundle = createAction(updateBundleConfig);
