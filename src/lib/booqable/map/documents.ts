/**
 * Booqable `documents` (invoice / quote / contract / packing_slip) → local
 * `external_invoices` mapper.
 *
 * Law 1 — this file only maps. It never talks to Supabase and never talks to
 * the Booqable proxy; `sync.ts` (not written in this pass) is the only
 * caller, and it owns every DB read (existing rows, existing
 * `external_refs`) and every DB write (`idempotentInsert` / `safeUpdate`
 * from `dataAccess.ts`). A screen must never import this file directly.
 *
 * Law 17 — "client" only. This file uses that word exclusively; nothing
 * here concerns the client resource anyway, but the rule is restated here
 * per PLAN.md §0 law 17's own instruction to repeat it in every mapper.
 *
 * ## Ownership (spec §5.1 / §5.3) — READ-ONLY MIRROR, no exceptions
 *
 * §5.1: `documents` (invoice/quote/contract/packing-slip) → `external_invoices`,
 * **"no OS write. Booqable is sole issuer."** §5.3 spells this out further:
 * "ONLY Booqable issues invoices during the bridge. The OS mirrors documents
 * read-only into `external_invoices` and must never call
 * `recalculate_invoice_totals` (or any equivalent trigger/function) on them.
 * The OS's own `invoices` table stays completely empty until cutover — no
 * mapper or sync code should ever insert into the `invoices` table."
 *
 * This file is a PULL mapper only, same shape as every other file in this
 * directory (`clients.ts`, `products.ts`, `stock.ts`). It:
 *   - never imports anything from `../../dataAccess` or calls
 *     `idempotentInsert`/`safeUpdate` itself (that is `sync.ts`'s job, exactly
 *     as it is for every sibling mapper),
 *   - never produces a `sync_outbox` row — there is no push direction for
 *     documents at all, unlike `clients`/`orders` which the spec explicitly
 *     allows a narrow OS→Booqable write on,
 *   - never references, imports, or writes the `invoices` table (verified by
 *     reading `supabase/migrations/0006_finance.sql`'s `create table invoices`
 *     and its `recalculate_invoice_totals` trigger below — this file's own
 *     target type, `LocalExternalInvoiceFields`, only ever shapes a row for
 *     `external_invoices`, a structurally different table with a different
 *     column set, so there is no accidental overlap for a careless edit to
 *     produce),
 *   - never calls, references, or needs to know about `recalculate_invoice_totals`
 *     at all — that function lives on `invoices`/`invoice_lines`
 *     (`0006_finance.sql`), a table this file never touches.
 *
 * ## Table shape — verified against the migration, not assumed
 *
 * `external_invoices` (`supabase/migrations/0040_booqable_sync.sql` §8):
 *   id uuid pk, external_id text not null unique, booking_id uuid references
 *   bookings(id) [nullable], document_type text not null, number text,
 *   issued_at timestamptz, currency char(3) not null, total_minor bigint not
 *   null, tax_minor bigint, status text, raw jsonb not null, synced_at
 *   timestamptz not null default now().
 *
 * `synced_at` is DB-defaulted and never set by this file. `id` is DB-generated
 * on insert; updates are addressed by the local row id supplied through
 * `ctx.existingRefs`, exactly like every sibling mapper's `LocalRowUpdate`.
 *
 * `external_invoices` also carries its OWN unique `external_id` column
 * (unlike, say, `products`, which has no natural-key column at all) — but
 * this file still routes insert-vs-update and change-detection through
 * `ctx.existingRefs` / `ctx.existingPayloadHashes` (backed by `external_refs`,
 * entity-scoped `'documents'`), not a direct `external_invoices.external_id`
 * lookup, purely so `sync.ts` can drive all seven mapper files through the
 * exact same call shape. Two sources of truth for the same fact (the table's
 * own unique column, and `external_refs`) would otherwise need to agree on
 * every insert, which is a footgun this file avoids by only ever consulting
 * one of them.
 *
 * ## Money (spec §8.2)
 *
 * `total_in_cents` / `tax_in_cents` arrive in minor units already, and
 * `external_invoices.total_minor` / `tax_minor` are ALSO plain minor-unit
 * `bigint` columns (not a decimal-rupee column like `products.daily_rate`) —
 * so this is a straight 1:1 copy, multiply/divide nothing. There is no
 * rupee-decimal boundary being crossed here, so unlike `products.ts`
 * (`toRupees` at the DB-write boundary), this file does not need
 * `lib/money.ts`'s `Paisa`/`toRupees` at all — the value never leaves
 * "minor units" the whole way through.
 *
 * `base_price_as_decimal`-style display mirrors are, per `types.ts`'s own
 * file header, deliberately not modelled on `BooqableDocumentAttributes` at
 * all — nothing here can accidentally reach for one because there is nothing
 * to reach for.
 *
 * `total_in_cents` is nullable on the wire type but `total_minor` is
 * `NOT NULL` on the table — a document with a null total cannot be safely
 * inserted and is routed to `conflicts` (see `mapDocuments` below), never
 * defaulted to `0` (that would silently assert "this document is worth
 * nothing," which is a business claim this file has no basis to make).
 *
 * TODO(decision) — spec §8.2: "Assert currency equals NPR on every import. A
 * non-NPR record is skipped and logged, never converted." `BooqableDocumentAttributes`
 * (`types.ts` §11) carries NO currency field at all — there is nothing on a
 * single document record to assert against. Exactly the same gap
 * `products.ts`'s file header already flags for `products`/`bundles`
 * ("Booqable v4's product/bundle wire shape carries no currency field at
 * all... confirm whether currency is only ever available account-wide"), not
 * re-derived here. Resolved the same way: `ctx.accountCurrency` is threaded
 * through from `sync.ts` (presumably resolved once, account-wide, from
 * Booqable's `locations`/settings — out of this file's scope to determine
 * where) and asserted against `'NPR'` for the whole batch below, rather than
 * fabricating a per-record field that does not exist on the wire.
 *
 * ## Status — no wire source, left null
 *
 * `external_invoices.status` is a nullable `text` column. `BooqableDocumentAttributes`
 * has no `status`-shaped field at all (only `issued_at`, which is a
 * timestamp, not a state). TODO(decision): rather than inventing a status
 * vocabulary from `issued_at`'s mere presence (e.g. "has `issued_at` ⇒
 * 'issued'"), which would be exactly the kind of unstated business rule
 * CLAUDE.md's "never invent a product decision" forbids, this mapper leaves
 * `status` unset on insert and never touches it on update. Flagged here
 * rather than guessed.
 *
 * ## booking_id — resolved via a separate order ref map, nullable, never blocks a write
 *
 * `external_invoices.booking_id` is a nullable FK to `bookings`. A document's
 * only link to an order is `order_id` (`BooqableDocumentAttributes.order_id`,
 * itself nullable on the wire). Unlike `bundle_items.bundle_id`/`product_id`
 * (both `NOT NULL` — an unresolved bundle/product blocks the whole row), an
 * unresolved `booking_id` here is not fatal: the column allows `null`, and a
 * document legitimately arriving before its parent order has been pulled/synced
 * is an ordinary sequencing fact, not a conflict between two owners disagreeing
 * on a value. `ctx.orderRefs` (external Booqable order id -> local `bookings.id`,
 * scoped to `external_refs` entity `'orders'`, supplied by `sync.ts` the same
 * way `bundle_items.ts`'s bundle/product maps are) is consulted best-effort;
 * a miss simply leaves `booking_id: null`, no `conflicts` entry logged for it.
 *
 * ## Law 3 — archive, never delete
 *
 * `external_invoices` has no `archived`/`deleted_at`-shaped column at all, and
 * `BooqableDocumentAttributes` has no `archived` field either — Booqable
 * documents are not modelled as archivable in the wire shape this file reads.
 * Nothing to map here; noted so a future reader does not go looking for an
 * archive branch this file never needed.
 *
 * ## Law 4 — not applicable
 *
 * Law 4 (payments immutable, corrections are reversal rows) governs the
 * `payments` table, mapped by a different (not-yet-written) sibling file.
 * `external_invoices` is a plain upsert-by-hash mirror, same update discipline
 * every other Booqable-is-master entity in this directory already uses
 * (`clients.ts`, `products.ts`) — restated here only so a reader does not
 * assume Law 4's insert-only shape extends to this table too; it does not.
 */

import type { BooqableDocumentAttributes, BooqableId } from '../types'
import type { BooqableFlatResource } from '../client'

/* ── shared result / context shapes — same pattern as every sibling mapper ─ */

/** One row this mapper wants updated, paired with the local id it targets — `sync.ts` calls `safeUpdate('external_invoices', id, fields)` with these directly. */
export interface LocalRowUpdate<TFields> {
  id: string
  fields: TFields
}

/**
 * Mirrors `sync_conflicts` (`0040_booqable_sync.sql`) minus DB-defaulted
 * columns, same shape as every sibling mapper file. `owner` is always
 * `'booqable'` here — every field this file ever writes is on the
 * Booqable-is-master side of §5.1; a conflict row only ever means "the
 * inbound value could not be safely mirrored," never a local-wins case
 * (there is no local-writable field on `external_invoices` at all — see the
 * file header).
 */
export interface SyncConflictInsert {
  entity: string
  local_id: string | null
  external_id: string | null
  field: string
  local_value: string | null
  external_value: string | null
  owner: 'booqable'
}

export interface PullResult<TInsert, TUpdate> {
  toInsert: TInsert[]
  toUpdate: LocalRowUpdate<TUpdate>[]
  conflicts: SyncConflictInsert[]
}

/**
 * Everything `sync.ts` must resolve/supply before calling `mapDocuments` —
 * see the file-header TODO(decision)s for why each of these can't be
 * computed in here without inventing an answer.
 */
export interface DocumentSyncContext {
  /** external_id -> local `external_invoices.id`, for rows already synced (from `external_refs`, entity-scoped `'documents'` by the caller). Present ⇒ update; absent ⇒ insert. */
  existingRefs: ReadonlyMap<BooqableId, string>
  /** `external_refs.payload_hash` for rows already synced, so a genuinely-unchanged record can be skipped (spec §7 rule 3) instead of writing a no-op update. */
  existingPayloadHashes: ReadonlyMap<BooqableId, string>
  /** external Booqable order id -> local `bookings.id`, from `external_refs` entity-scoped `'orders'` — see file header's booking_id note. A miss leaves `booking_id: null`, never blocks the write. */
  orderRefs: ReadonlyMap<BooqableId, string>
  /**
   * TODO(decision) — see file header's currency note. Resolved once,
   * account-wide, by `sync.ts` (source unconfirmed — likely Booqable's
   * `locations`/settings resource). Asserted against `'NPR'` for the whole
   * batch; a non-NPR value causes every record in this call to be skipped
   * and logged per spec §8.2, never converted.
   */
  accountCurrency: string
}

const EXPECTED_CURRENCY = 'NPR'

/** Cheap, non-cryptographic stable hash for change detection only (spec §7 rule 3) — same FNV-1a-32-over-sorted-JSON approach every sibling mapper uses, duplicated rather than imported so this file stays self-contained like its siblings. */
export function computeDocumentPayloadHash(value: unknown): string {
  const stable = JSON.stringify(sortKeysDeep(value))
  let hash = 0x811c9dc5
  for (let i = 0; i < stable.length; i++) {
    hash ^= stable.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/* ── documents → local `external_invoices` rows ─────────────────────────── */

export interface LocalExternalInvoiceFields {
  /** Nullable — see file header's booking_id note. */
  booking_id: string | null
  document_type: string
  number: string | null
  /** Raw ISO-8601 as Booqable sent it — Law 8, AD/UTC as-is, never converted here. */
  issued_at: string | null
  /** Always `EXPECTED_CURRENCY` by construction — a non-NPR batch never reaches this far (see `mapDocuments`). */
  currency: string
  /** Minor units, 1:1 from `total_in_cents` — see file header money note. */
  total_minor: number
  /** Minor units, 1:1 from `tax_in_cents`; `null` when Booqable supplied none. */
  tax_minor: number | null
  /** The full flattened Booqable record, verbatim — this table's own audit/reconciliation trail (`raw jsonb not null`). */
  raw: Record<string, unknown>
}

export interface LocalExternalInvoiceInsert extends LocalExternalInvoiceFields {
  external_id: string
}

/**
 * `external_id` is deliberately excluded from the update shape — it is the
 * table's own natural key, fixed at insert time, and is not something a
 * resync ever changes (the record this mapper is updating was found BY that
 * same `external_id`, via `ctx.existingRefs`). `status` is also excluded —
 * see the file header; this mapper never sets it on insert OR update, so
 * there is no update-shape field for it to occupy at all.
 */
export type LocalExternalInvoiceUpdate = LocalExternalInvoiceFields

export function mapDocuments(
  records: readonly BooqableFlatResource<'documents', BooqableDocumentAttributes>[],
  ctx: DocumentSyncContext,
): PullResult<LocalExternalInvoiceInsert, LocalExternalInvoiceUpdate> {
  const toInsert: LocalExternalInvoiceInsert[] = []
  const toUpdate: LocalRowUpdate<LocalExternalInvoiceUpdate>[] = []
  const conflicts: SyncConflictInsert[] = []

  // spec §8.2 — assert currency once, account-wide (see file header
  // TODO(decision) on why this cannot be a per-record wire-field check).
  // A non-NPR account currency skips and logs every record in this batch,
  // never converts.
  if (ctx.accountCurrency !== EXPECTED_CURRENCY) {
    for (const record of records) {
      conflicts.push({
        entity: 'documents',
        local_id: ctx.existingRefs.get(record.id) ?? null,
        external_id: record.id,
        field: 'currency',
        local_value: null,
        external_value: ctx.accountCurrency,
        owner: 'booqable',
      })
    }
    return { toInsert, toUpdate, conflicts }
  }

  for (const record of records) {
    const externalId = record.id
    const localId = ctx.existingRefs.get(externalId)
    const isUpdate = localId !== undefined

    // total_minor is NOT NULL on external_invoices; total_in_cents is
    // nullable on the wire — see file header. Never defaulted to 0.
    if (record.total_in_cents === null) {
      conflicts.push({
        entity: 'documents',
        local_id: localId ?? null,
        external_id: externalId,
        field: 'total_minor',
        local_value: null,
        external_value: null,
        owner: 'booqable',
      })
      continue
    }

    const bookingId = record.order_id !== null ? (ctx.orderRefs.get(record.order_id) ?? null) : null

    const fields: LocalExternalInvoiceFields = {
      booking_id: bookingId,
      document_type: record.document_type,
      number: record.number,
      issued_at: record.issued_at,
      currency: EXPECTED_CURRENCY,
      total_minor: record.total_in_cents,
      tax_minor: record.tax_in_cents,
      raw: record as unknown as Record<string, unknown>,
    }

    const hash = computeDocumentPayloadHash(fields)
    if (isUpdate) {
      if (ctx.existingPayloadHashes.get(externalId) === hash) {
        // spec §7 rule 3 — unchanged, no write, no log noise.
        continue
      }
      toUpdate.push({ id: localId as string, fields })
    } else {
      toInsert.push({ ...fields, external_id: externalId })
    }
  }

  return { toInsert, toUpdate, conflicts }
}

/* ── uniform dispatcher for sync.ts ──────────────────────────────────────
 * Matches `products.ts`/`clients.ts`'s `pull(entity, rawRecords, ctx)` call
 * shape so `sync.ts` can drive all seven mapper files identically, even
 * though this file only ever handles the one `'documents'` entity.
 */

export type DocumentEntity = 'documents'

export function pull(
  entity: DocumentEntity,
  rawRecords: readonly BooqableFlatResource<'documents', BooqableDocumentAttributes>[],
  ctx: DocumentSyncContext,
): PullResult<LocalExternalInvoiceInsert, LocalExternalInvoiceUpdate> {
  switch (entity) {
    case 'documents':
      return mapDocuments(rawRecords, ctx)
  }
}
