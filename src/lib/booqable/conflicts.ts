/**
 * Booqable sync conflict detection — spec §7 conflict policy, pure helpers
 * only.
 *
 * ## Law 1 / Law 2
 *
 * This file does no I/O. Every function here takes plain values in and
 * returns plain values out — never a Supabase call, never a Booqable call,
 * never `Date.now()`. `sync.ts` is the only caller: it reads whatever this
 * file needs from the database, calls these functions, and performs the
 * actual `sync_conflicts` insert itself. Kept this way specifically so the
 * policy decisions below are unit-testable without a database, per this
 * file's own brief ("given inputs, return what should be written, rather
 * than reaching into the database directly from deep inside a comparison
 * function").
 *
 * ## Law 17 — "client" only
 *
 * No identifier in this file uses the term Law 17 forbids — nothing here is
 * entity-specific at all; every function takes a bare `entity: string` the
 * caller supplies (e.g. `'clients'`, `'bookings'`), never a Booqable
 * resource name hard-baked in.
 *
 * ## What this file is NOT responsible for
 *
 * The seven mapper files under `map/` already build their OWN
 * `sync_conflicts`-shaped rows for the failures specific to their own
 * mapping (an unresolvable FK, a value that fails a CHECK constraint, a
 * genuinely ambiguous classification, …) — see e.g. `map/clients.ts`'s
 * duplicate-phone handling or `map/payments.ts`'s Law 5 classifier. Those
 * are NOT reimplemented here; `sync.ts` merges the mappers' own conflict
 * arrays with whatever THIS file additionally detects. This file exists for
 * the two conflict-policy rules that need information no single mapper has
 * in hand:
 *
 *   - rule 3 (`payloadUnchanged`) — a bare hash comparison, factored into one
 *     named place instead of every mapper re-writing the same `===` check
 *     (they already do this internally too, for their own early-exit; this
 *     is exposed here so `sync.ts`'s orchestration layer has the identical
 *     check available for anything it decides outside a mapper's own loop).
 *   - rules 2 and 4 (`resolveFieldSync`) — genuinely bidirectional fields
 *     (client contact, order status/dates) can be touched from BOTH sides.
 *     Knowing whether "both sides changed" requires knowing what the OS side
 *     independently attempted, which is `sync_outbox` state — outside any
 *     single mapper's pure, DB-free view of the world by construction. See
 *     `resolveFieldSync` below for exactly what signal is used and why.
 *
 * ## TODO(decision) — alerting on stale conflicts (spec §7 rule 5)
 *
 * Spec §7 rule 5: "Unresolved count over 20 for 24h is meant to be an alert
 * condition eventually." Not built here — this file only shapes the ROW an
 * eventual alert query would count; no alerting mechanism (scheduled query,
 * notification, email) exists anywhere in this pass. A future piece needs to
 * `select count(*) from sync_conflicts where resolution is null and
 * detected_at < now() - interval '24 hours'` and decide what "alert" means
 * (in-app banner? a role to notify?) — genuinely unbuilt, not silently
 * approximated by anything below.
 */

import type { BooqableId } from './types'
import type { HeldPaymentRecord } from './map/payments'

/* ── canonical sync_conflicts row shape ──────────────────────────────────
 * Mirrors `sync_conflicts` (`supabase/migrations/0040_booqable_sync.sql`
 * §6) minus the columns the DB assigns itself (`id`, `detected_at`,
 * `resolution`, `resolved_by`, `resolved_at` — spec §7 rule 5's future
 * screen owns those three). Every one of the seven mapper files under
 * `map/` already declares an identical, independently-typed interface of
 * this exact same shape (structurally, not by import) — this is the ONE
 * canonical, imported copy `sync.ts` normalises all of them onto before a
 * single `insert into sync_conflicts` call, so there is one row shape in
 * the codebase, not eight structurally-identical-but-separately-declared
 * ones drifting apart over time.
 */
export interface SyncConflictInsert {
  entity: string
  local_id: string | null
  external_id: string | null
  field: string
  local_value: string | null
  external_value: string | null
  /** Per spec §7: a conflict row only ever means "the Booqable-owned value applies, the other side's attempt did not" — `owner` names which side's value the row is RECORDING as authoritative, not which side is at fault. Every case this file (and every mapper) produces is `'booqable'`; `'os'` is carried in the type only so a hypothetical future OS-wins case (none exists in spec §7) is representable without a type change. */
  owner: 'booqable' | 'os'
}

/** One named constructor so every call site builds the row the same way — never an ad hoc object literal scattered across `sync.ts`. */
export function buildConflict(
  entity: string,
  localId: string | null,
  externalId: BooqableId | string | null,
  field: string,
  localValue: string | null,
  externalValue: string | null,
  owner: 'booqable' | 'os' = 'booqable',
): SyncConflictInsert {
  return { entity, local_id: localId, external_id: externalId, field, local_value: localValue, external_value: externalValue, owner }
}

/* ── rule 3 — payload_hash decides if anything changed ───────────────────
 * "equal hash means no write and no log noise." `previousHash` is
 * `external_refs.payload_hash` from the last successful sync of this
 * record; `undefined`/`null` means this is the FIRST time this external id
 * has ever been seen (no baseline to compare against at all), which is
 * never "unchanged" — there is nothing it could be unchanged FROM.
 */
export function payloadUnchanged(previousHash: string | null | undefined, currentHash: string): boolean {
  return previousHash !== undefined && previousHash !== null && previousHash === currentHash
}

/* ── rules 2 and 4 — the bidirectional-field gate ─────────────────────────
 *
 * Both rules fire on the same underlying fact — "the local value disagrees
 * with what Booqable just sent" — and differ only in whether the field in
 * question has a legitimate local write path at all:
 *
 *   rule 2 — field is Booqable-is-master with NO write-back allowed at all
 *            (spec §5.1's "no OS write" entities/fields — products,
 *            stock_items, bundles, payments, documents, locations/settings,
 *            and every `clients`/`orders` field NOT named in the write-back
 *            allowlist, spec §11). Any local/Booqable disagreement here is
 *            not a legitimate edit racing Booqable — it is drift (a stale
 *            cache, a direct DB edit, a bug) — discarded and logged.
 *
 *   rule 4 — field IS on the write-back allowlist (spec §11 items 1-2 for
 *            `clients` contact fields, items 3-6 for `orders`/status) and
 *            BOTH sides changed it independently. Booqable's value still
 *            wins (rule 1 — field owner wins, no merge, no
 *            timestamp-as-tiebreak) but the OS's now-discarded attempt is
 *            flagged for a human, per spec §7 rule 4 exactly.
 *
 * The two rules collapse into one function because the caller-supplied
 * `isOsWritable` flag is the only thing that decides which one applies —
 * splitting them into two functions would just duplicate the "do the values
 * even differ" check twice.
 *
 * `isOsWritable` is deliberately a caller-supplied boolean, not a field-name
 * allowlist hard-baked into this file: the write-back allowlist (spec §11)
 * already has exactly one canonical home — `WRITEBACK_ALLOWLIST` in
 * `sync.ts`, which is also what builds the outbound push payloads. Repeating
 * that list here as a second, field-level enumeration would be the same
 * "two sources of truth for the same fact" footgun `map/documents.ts`'s
 * header already calls out for a different pair of columns — so this file
 * takes the answer as an input instead of re-deriving it.
 *
 * "Both sides changed" needs a baseline to compare against, and this schema
 * has none at the field level (`external_refs.payload_hash` is a whole-
 * payload hash, not addressable per field — see `payloadUnchanged` above).
 * The best AVAILABLE evidence that the OS side independently touched this
 * exact field is a still-unconfirmed `sync_outbox` row for the same
 * local row carrying a DIFFERENT value for it — a real, currently queryable
 * fact, not an invented one. `pendingLocalPushValue` is that value, supplied
 * by `sync.ts` (which owns reading `sync_outbox`); `undefined` means no such
 * row exists, i.e. nothing bidirectional is in flight for this field.
 */

export interface FieldSyncInput {
  entity: string
  localId: string | null
  externalId: BooqableId | string | null
  field: string
  /** Spec §11's write-back allowlist answer for this exact field — supplied by the caller (`sync.ts`'s `WRITEBACK_ALLOWLIST`), never re-derived here. */
  isOsWritable: boolean
  /** The value currently sitting in the local row, before this pull applies anything. */
  localValue: string | null
  /** The value Booqable just sent for this field on this pull. */
  externalValue: string | null
  /**
   * A still-pending/processing `sync_outbox` row's value for this SAME
   * field, if one exists — the concrete evidence the OS independently
   * changed it and Booqable has not yet confirmed the push. `undefined` ⇒
   * no pending local push for this field.
   */
  pendingLocalPushValue: string | null | undefined
}

export type FieldSyncDecision =
  /** No conflict — apply Booqable's value (or there is nothing to apply; the caller already knows which). Rule 1, the ordinary case. */
  | { action: 'apply' }
  /** Rule 4 — both sides changed an OS-writable field. Apply Booqable's value; the row below is the OS's now-discarded attempt, flagged for a human. */
  | { action: 'apply_and_flag'; conflict: SyncConflictInsert }
  /** Rule 2 — local drifted on a field it has no legitimate write path to at all. Apply Booqable's value; the row below records the drift. */
  | { action: 'discard_local_and_flag'; conflict: SyncConflictInsert }

export function resolveFieldSync(input: FieldSyncInput): FieldSyncDecision {
  if (input.localValue === input.externalValue) {
    // Both sides already agree — nothing to reconcile, whether or not a
    // push happens to be pending (it will simply confirm what is already
    // true once it lands).
    return { action: 'apply' }
  }

  if (!input.isOsWritable) {
    // Rule 2.
    return {
      action: 'discard_local_and_flag',
      conflict: buildConflict(input.entity, input.localId, input.externalId, input.field, input.localValue, input.externalValue, 'booqable'),
    }
  }

  if (input.pendingLocalPushValue !== undefined && input.pendingLocalPushValue !== input.externalValue) {
    // Rule 4 — a pending local push disagrees with what Booqable just sent:
    // both sides changed this field since the last confirmed sync.
    return {
      action: 'apply_and_flag',
      conflict: buildConflict(input.entity, input.localId, input.externalId, input.field, input.localValue, input.externalValue, 'booqable'),
    }
  }

  // OS-writable field, local differs from Booqable, but nothing pending
  // disagrees with Booqable's value. The most likely explanation is
  // ordinary sequencing (a fresh local row not yet synced, or a push that
  // already landed and Booqable is simply echoing it back) — not a genuine
  // collision. Applied per rule 1, no conflict logged: logging one here
  // would be exactly the "log noise" spec §7 rule 3 exists to prevent for
  // the ordinary case.
  return { action: 'apply' }
}

/* ── held payments (Law 5 §3 ambiguous classification) → a conflict row ──
 * `map/payments.ts`'s own header: "No dedicated review-queue table exists
 * in the schema yet — sync.ts decides where to persist these (e.g.
 * sync_conflicts with a distinguishing field, pending a real review-queue
 * table), but MUST NOT insert a held record into payments OR
 * deposit_movements under any circumstance." This is that decision, made
 * once, in one named place: a `sync_conflicts` row with
 * `field: 'payment_classification'`, carrying enough of the held record's
 * own detail in `external_value` for a human to classify it later without
 * needing to go back to Booqable first.
 */
export function heldPaymentToConflict(held: HeldPaymentRecord): SyncConflictInsert {
  return buildConflict(
    'payments',
    null,
    held.externalId,
    'payment_classification',
    null,
    `booking_local_id=${held.bookingLocalId} payment_type="${held.rawPaymentType}" payment_method=${held.paymentMethodName ?? '(none)'} amount_in_cents=${held.amountInCents} — ${held.reason}`,
    'booqable',
  )
}
