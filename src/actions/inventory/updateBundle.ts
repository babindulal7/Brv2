import { createAction, type ActionConfig, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, safeUpdate } from '../../lib/dataAccess';
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

/** The exact `bundles` columns this action writes — typechecked against 0004:380-398. */
type BundleUpdatePayload = {
  name?: string;
  description?: string | null;
  category_id?: string | null;
  daily_rate?: number;
  weekly_rate?: number;
  is_active?: boolean;
  /* Law 7 — AD in UTC. Device clock, because PostgREST cannot send `now()` in
     an UPDATE payload; the same stamp `blockClient` makes for the same reason. */
  updated_at: string;
  updated_by: string;
};

/**
 * The `bundle_items` columns an edit may write.
 *
 * ⚠ `bundle_items` has **no `updated_at` / `updated_by`** (0004:405-422) — only
 * `created_at` / `created_by`. So a component edit is unattributed at the row;
 * the only trace is the parent bundle's `updated_by`, which this action always
 * stamps even when the patch is otherwise empty and the edit was lines-only.
 * That is deliberate: it keeps "who last touched this kit" answerable.
 */
type BundleItemUpdatePayload = {
  quantity?: number;
  days?: number;
  is_mandatory?: boolean;
  sort_order?: number;
};

type BundleItemInsertPayload = {
  client_uuid: string;
  bundle_id: string;
  product_id: string;
  quantity: number;
  days: number;
  sort_order: number;
  created_by: string;
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

    /* ── 1 · the bundle itself ──────────────────────────────────────────────
       Read first, by uuid, naming only unmasked columns. A bundle that cannot
       be read is either gone or invisible to this session, and either way the
       edit must not proceed to a write that would report success. */
    const { data: existingRow, error: existingError } = await supabase
      .from('bundles')
      .select('id, bundle_code')
      .eq('id', input.bundleId)
      .maybeSingle();
    if (existingError) {
      throw new Error(`Could not read the bundle, so nothing was saved: ${existingError.message}`);
    }
    const existing = existingRow as { id?: string; bundle_code?: string } | null;
    if (!existing || typeof existing.id !== 'string') {
      throw new Error(
        `No bundle has id ${input.bundleId}, so nothing was saved. It may have been opened from a stale ` +
          `list — reopen the bundle and try again.`,
      );
    }
    const bundleId = existing.id;
    const bundleCode = existing.bundle_code ?? input.bundleId;

    /* ── 2 · the category, if it was touched ───────────────────────────────── */
    let categoryColumn: { category_id?: string | null } = {};
    if (patch.categoryId !== undefined) {
      if (patch.categoryId === null) {
        categoryColumn = { category_id: null };
      } else {
        const { data: categoryRow, error: categoryError } = await supabase
          .from('inventory_categories')
          .select('id')
          .eq('id', patch.categoryId)
          .maybeSingle();
        if (categoryError) {
          throw new Error(`Could not look up the category, so nothing was saved: ${categoryError.message}`);
        }
        if (!categoryRow) {
          throw new Error(
            `No category has id ${patch.categoryId}, so nothing was saved. The category list changed ` +
              `under the form — reopen it and choose again.`,
          );
        }
        categoryColumn = { category_id: (categoryRow as { id: string }).id };
      }
    }

    /* ── 3 · every edited line must belong to THIS bundle ───────────────────
       Without this an itemId from another bundle — a stale tab, a copied id —
       would be updated by id alone, editing a kit the operator never opened.
       One read for all of them, and it also gives the highest sort_order the
       additions continue from. */
    const { data: itemRows, error: itemsError } = await supabase
      .from('bundle_items')
      .select('id, sort_order')
      .eq('bundle_id', bundleId);
    if (itemsError) {
      throw new Error(`Could not read the bundle's components, so nothing was saved: ${itemsError.message}`);
    }
    const ownRows = (itemRows ?? []) as unknown as Array<{ id: string; sort_order: number }>;
    const ownItemIds = new Set(ownRows.map((r) => r.id));
    for (const [i, e] of lineEdits.entries()) {
      if (!ownItemIds.has(e.itemId)) {
        throw new Error(
          `Component ${i + 1} (row ${e.itemId.slice(0, 8)}) does not belong to ${bundleCode}, so nothing ` +
            `was saved. The form is out of date with the bundle — reopen it.`,
        );
      }
    }
    for (const [i, d] of lineDeactivations.entries()) {
      if (!ownItemIds.has(d.itemId)) {
        throw new Error(
          `Deactivated component ${i + 1} (row ${d.itemId.slice(0, 8)}) does not belong to ${bundleCode}, so nothing ` +
            `was saved. The form is out of date with the bundle — reopen it.`,
        );
      }
    }
    const nextSortOrder = ownRows.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1;

    /* ── 4 · every added product, resolved to a uuid ───────────────────────── */
    const resolvedAdds: Array<{ productId: string; qty: number; days: number; clientUuid: string }> = [];
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
          productId
            ? `New component ${i + 1} names product id ${productId}, which is not in the catalogue, so ` +
              `nothing was saved. The catalogue changed under the ` +
              `form — reopen it and pick the component again.`
            : `New component ${i + 1}, "${productName}", is not a product in the products table, so ` +
              `nothing was saved. ` +
              `bundle_items.product_id is a uuid FK (0004:411); a name has to match a row exactly.`,
        );
      }
      resolvedAdds.push({
        productId: (productRow as { id: string }).id,
        qty: a.qty,
        /* Law 9 — stated, not defaulted, so the insert cannot become silent if
           the column default is ever dropped. */
        days: a.days ?? 1,
        clientUuid: a.clientUuid,
      });
    }

    /* ── 5 · the bundle row ────────────────────────────────────────────────
       Always written, even when only lines changed: `updated_by` is the sole
       attribution a component edit gets (see BundleItemUpdatePayload). */
    const payload: BundleUpdatePayload = {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: orNull(patch.description) } : {}),
      ...categoryColumn,
      ...moneyCol('daily_rate', patch.dailyRatePaisa),
      ...moneyCol('weekly_rate', patch.weeklyRatePaisa),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    };
    const changedKeys = Object.keys(payload).filter((k) => k !== 'updated_at' && k !== 'updated_by');

    let echoed: { id?: string; bundle_code?: string } | null = null;
    try {
      /* `as never` — the sanctioned cast from createBundle/createClient:
         `dataAccess` is generic over the hand-written `types/database.ts`, and
         `BundleUpdatePayload` above is what typechecks the payload against 0004.
         `returningColumns` names only columns 0035's mask leaves open, and the
         single-row echo is what makes an RLS refusal (0 rows, no error) visible. */
      const updated = await safeUpdate(
        'bundles' as never,
        bundleId,
        payload as never,
        input.clientUuid,
        { returningColumns: 'id, bundle_code' },
      );
      echoed = updated.data as unknown as { id?: string; bundle_code?: string } | null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(describeBundleUpdateFailure(message));
    }
    if (!echoed || typeof echoed.id !== 'string') {
      throw new Error(
        `The database did not confirm the change to ${bundleCode}, so treat it as not saved. Check the ` +
          `connection and save again.`,
      );
    }

    /* ── 6 · component edits, one row at a time, each confirmed ─────────────
       After the parent row, so a refused parent update stops here rather than
       leaving components changed under an unchanged bundle. */
    let linesUpdated = 0;
    for (const [i, e] of lineEdits.entries()) {
      const itemPayload: BundleItemUpdatePayload = {
        ...(e.quantity !== undefined ? { quantity: e.quantity } : {}),
        ...(e.days !== undefined ? { days: e.days } : {}),
        ...(e.isMandatory !== undefined ? { is_mandatory: e.isMandatory } : {}),
        ...(e.sortOrder !== undefined ? { sort_order: e.sortOrder } : {}),
      };
      if (Object.keys(itemPayload).length === 0) continue;
      try {
        const saved = await safeUpdate(
          'bundle_items' as never,
          e.itemId,
          itemPayload as never,
          e.clientUuid,
          { returningColumns: 'id' },
        );
        const row = saved.data as unknown as { id?: string } | null;
        if (saved.error || !row || typeof row.id !== 'string') {
          throw new Error('the database did not confirm the row');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${bundleCode} was updated and ${linesUpdated} component${linesUpdated === 1 ? '' : 's'} saved, ` +
            `but component ${i + 1} failed: ${describeBundleUpdateFailure(message)}. Fix it and save ` +
            `again — resubmitting the same form re-applies the same edits rather than doubling them ` +
            `(Law 8).`,
        );
      }
      linesUpdated += 1;
    }

    /* ── 7 · additions ─────────────────────────────────────────────────────── */
    let linesAdded = 0;
    for (const [i, a] of resolvedAdds.entries()) {
      const itemPayload: BundleItemInsertPayload = {
        client_uuid: a.clientUuid,
        bundle_id: bundleId,
        product_id: a.productId,
        quantity: a.qty,
        days: a.days,
        sort_order: nextSortOrder + i,
        created_by: ctx.userId,
      };
      try {
        const inserted = await idempotentInsert('bundle_items' as never, itemPayload as never);
        const row = inserted.data as unknown as { id?: string } | null;
        if (inserted.error || !row || typeof row.id !== 'string') {
          throw new Error('the database did not confirm the row');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${bundleCode} was updated and ${linesAdded} of ${resolvedAdds.length} new component${
            resolvedAdds.length === 1 ? '' : 's'
          } added, but new component ${i + 1} failed: ${describeBundleUpdateFailure(message)}. Fix it and ` +
            `save again — the same key resolves to the same row instead of adding it twice (Law 8).`,
        );
      }
      linesAdded += 1;
    }

    /* ── 8 · soft-deactivations (Law 3, OPEN_DECISIONS.md §4.52) ────────────── */
    let linesDeactivated = 0;
    for (const [i, d] of lineDeactivations.entries()) {
      const itemPayload = {
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: ctx.userId,
      };
      try {
        const saved = await safeUpdate(
          'bundle_items' as never,
          d.itemId,
          itemPayload as never,
          d.clientUuid,
          { returningColumns: 'id' },
        );
        const row = saved.data as unknown as { id?: string } | null;
        if (saved.error || !row || typeof row.id !== 'string') {
          throw new Error('the database did not confirm the row');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${bundleCode} was updated, but deactivating component ${i + 1} failed: ${describeBundleUpdateFailure(message)}. Fix it and ` +
            `save again — the same key resolves to the same row instead of deactivating it twice (Law 8).`,
        );
      }
      linesDeactivated += 1;
    }

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
