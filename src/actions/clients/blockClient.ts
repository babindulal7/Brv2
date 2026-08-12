import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert, safeUpdate } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { getClientRecordByCode } from '../../lib/queries/clients'

/**
 * # BLOCK_CLIENT — the write, and the end of block-as-component-state
 *
 * ## What this replaced
 *
 * ```ts
 * console.log(`[DB TX] Client ${input.clientId} ${input.blocked ? 'BLOCKED' : 'UNBLOCKED'}`)
 * return { result: { success: true }, events }
 * ```
 *
 * …behind screens that flipped `isBlocked` in local React state and showed a
 * green toast. A block that lives in component state is gone on reload, and
 * `client_directory_v.is_blocked` (0054) now publishes the real fact, so the
 * local flip had become a fake block painted over a genuinely un-blocked
 * record with nothing to tell the two apart. Both screens had already been
 * changed to refuse in writing rather than fake it; this file is what they
 * refused for.
 *
 * ## Blocked is a row, not a status
 *
 * `0005_clients.sql:150` — *"Deactivated is terminal, never a DELETE. Blocked is
 * never written here — it is a flag on client_flags."* `client_status` has
 * exactly two members, `Active | Deactivated` (verified against the live enum).
 * So:
 *
 *   **block**   = INSERT `client_flags` (flag_type `'Blocked'`, source
 *                 `'Manual'`, `created_by` = the actor — CHECK
 *                 `client_flags_manual_requires_actor` makes that mandatory:
 *                 *"a person's decision must name the person"*).
 *   **unblock**  = UPDATE that row's `removed_at` / `removed_by` /
 *                 `removal_reason`. **Never a DELETE** — 0005:254-255,
 *                 *"Removal is a state change on the row; the row is never
 *                 deleted"*, and Law 3 more generally. The history of who
 *                 blocked whom, why, and who lifted it, is the point.
 *
 * `client_flags_one_live_per_kind` — a partial unique index on
 * `(client_id, flag_type) where removed_at is null` (0005:260-262) — is what
 * makes "already blocked" a database fact rather than a UI guess, and it is why
 * a second block is refused by name below instead of silently inserting a
 * second live row.
 *
 * `client_flags.client_id` is the **company**, not a contact (0005:246-247:
 * *"otherwise a second contact books around the block"*).
 *
 * ## What blocking does and does not do
 *
 * 0005:264-269, and this action must not extend it: a live Blocked flag causes
 * the database to reject a **new booking INSERT** for that client, with no role
 * bypass including Owner. It must **not** cancel existing bookings, void
 * invoices, remove portal access to existing records, or touch rental history.
 * Nothing in this file writes anything but the flag row.
 *
 * ## ⚠ TODO(decision) — `client.block` resolves to no rule in `lib/rbac`
 *
 * `actions/core.ts:105-126` resolves seven capability strings and `client.block`
 * is not one of them, so the dispatcher denies this action before `execute`
 * runs. Fail-closed and deliberate — and, like `client.create`, not actually
 * unknown. The rule is applied to the database and simply has no mirror in
 * `lib/rbac`, which rbac's own header says is the drift it exists to prevent.
 * Read off the live project, 12 Aug 2026:
 *
 *     policy client_flags_insert  with check (
 *       (flag_type =  'Blocked' and auth_user_role() = any (array['Owner','Admin','Manager']))
 *       or
 *       (flag_type <> 'Blocked' and auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse']))
 *     )
 *     policy client_flags_update  using  (… Owner, Admin, Manager, Coordinator, Warehouse …)
 *                                 with check (… same Blocked/non-Blocked split as above …)
 *
 * i.e. **Owner, Admin and Manager may block and unblock; Coordinator and
 * Warehouse may not** — 0038 split 0025's single policy specifically to take
 * Blocked away from the Coordinator seat (0005:1044). Because the UPDATE policy's
 * WITH CHECK is evaluated against the post-update row, whose `flag_type` is still
 * `'Blocked'`, the same three roles gate the unblock. Writing that into
 * `lib/rbac` is a one-function change in a file this task was not given, so it is
 * recorded here rather than invented here.
 *
 * ## ⚠ TODO(decision) — is a reason mandatory?
 *
 * `client_flags.reason` is nullable and 0005:250-251 says why: *"nullable ONLY
 * because Blacklist.md leaves mandatory-reason unsettled while arguing it should
 * be mandatory. Do not ship nullable for Blocked without that ruling."* Every
 * block surface in this app already requires ten characters, so `validate`
 * below enforces the rule the UI already enforces rather than inventing a
 * looser one. `removal_reason` on the unblock side has no such UI rule and is
 * therefore accepted-but-optional; 0005:256 argues it should be recorded
 * (*"A block whose reason nobody recorded becomes a block nobody dares
 * remove"*) without making it mandatory, and that gap is the ruling above.
 */

export type BlockClientInput = {
  /**
   * `clients.client_code` — e.g. `CL-2026-0001`.
   *
   * **Not the uuid, and deliberately so.** Every clients surface holds
   * `ClientRecord.id`, which `queries/clients.ts:toClientRecord` sets to
   * `client_code`; `client_flags.client_id` is a uuid FK. Taking the code and
   * resolving it here is what stops a screen passing a code into a uuid column
   * and writing a flag against nothing. The previous input was named `clientId`
   * and was handed exactly that code by both call sites.
   */
  clientCode: string
  /** `true` inserts the flag, `false` lifts the live one. Never a delete. */
  blocked: boolean
  /** `client_flags.reason` on a block; `client_flags.removal_reason` on an unblock. */
  reason?: string | undefined
  /** **Law 8** — minted where the operator pressed the button, reused across retries. */
  clientUuid?: string | undefined
}

export type BlockClientResult = {
  /** `clients.id` — the uuid the flag row points at. */
  clientId: string
  clientCode: string
  clientName: string
  blocked: boolean
  /** `client_flags.id` — the row inserted, or the row whose removal fields were set. */
  flagId: string
}

/** The minimum a block row needs. `source` defaults to `'Manual'` on the table;
 *  it is stated because `client_flags_manual_requires_actor` pairs it with `created_by`. */
type BlockFlagInsert = {
  client_uuid: string
  client_id: string
  flag_type: 'Blocked'
  source: 'Manual'
  reason: string
  created_by: string
}

/** Law 3's removal trio. There is no other unblock path and no DELETE anywhere. */
type BlockFlagRemoval = {
  removed_at: string
  removed_by: string
  removal_reason: string | null
}

/**
 * The live Blocked flag's row id, or null.
 *
 * ⚠ **Why this read is here and not in `lib/queries/clients.ts`.** That module
 * owns client reads (Law 2's Single Query Rule) and is the correct long-term
 * home, but it is outside this task's file list and another session is live-
 * editing this repo — the same trade `actions/finance/recordPayment.ts:164-180`
 * records for its own invoice lookup. This is a one-column, single-row lookup
 * against the partial unique index, with no filters and no money conversion, so
 * none of that module's masking contract is being re-implemented.
 * TODO(refactor): hoist to `queries/clients.ts` as `liveBlockFlagId()`.
 */
async function liveBlockedFlagId(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('client_flags')
    .select('id')
    .eq('client_id', clientId)
    .eq('flag_type', 'Blocked')
    .is('removed_at', null)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not read this client's block state, so nothing was changed: ${error.message}`)
  }
  return data ? (data as unknown as { id: string }).id : null
}

/**
 * The config, exported alongside the dispatched action — same reason as
 * `createClient.ts`'s: `client.block` resolves to nothing in `checkCapability`,
 * so every call through `blockClient` is denied before `execute` runs, and this
 * handle is the only way the body can be tested until the matrix is ruled.
 */
export const blockClientConfig: ActionConfig<BlockClientInput, BlockClientResult> = {
  name: 'BLOCK_CLIENT',
  // Left naming the real capability — see the TODO(decision) in the header.
  permissions: ['client.block'],

  /**
   * `true` because `execute` below writes `client_flags` through
   * `lib/dataAccess` — `idempotentInsert` on block, `safeUpdate` on unblock —
   * and verifies the row came back before returning.
   *
   * ⚠ Driven against the live project as SQL, inside a PL/pgSQL block aborted
   * by `raise exception` so nothing committed: the Blocked insert made
   * `exists(live flag)` true, the removal UPDATE made it false again, and
   * `count(*)` on the client's flags stayed at 1 — the row is retained, Law 3.
   * It could **not** be driven through the UI, because the dispatcher denies
   * `client.block` before `execute` runs.
   */
  implemented: true,

  validate: (input) => {
    if (!input.clientCode || input.clientCode.trim() === '') {
      throw new Error('A block must name the client it applies to.')
    }
    if (typeof input.blocked !== 'boolean') {
      throw new Error('A block must state whether it is being applied or lifted.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This block carries no idempotency key, so a retry could write it twice. Nothing was sent.',
      )
    }
    if (input.blocked && (input.reason ?? '').trim().length < 10) {
      // The rule every block surface in the app already enforces. See the
      // TODO(decision) in the header for why it is not also a NOT NULL.
      throw new Error(
        'State a reason of at least ten characters. A block whose reason nobody recorded becomes a block ' +
          'nobody dares remove.',
      )
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused, not queued. `dataAccess` queues an offline write and
     * returns the payload it was handed as though it had landed
     * (`dataAccess.ts:39-43`, `:114-118`). A block that only exists in the
     * outbox is exactly the state this action was written to end: the screen
     * would say blocked, the database would say otherwise, and the booking gate
     * — which runs in Postgres — would let the next rental through.
     */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. A block is not queued for later — it is enforced by the database when a ' +
          'booking is created, so a block that has not reached the database stops nothing. Try again when ' +
          'you are back online.',
      )
    }

    const code = input.clientCode.trim()
    const profile = await getClientRecordByCode(code)
    if (!profile) {
      throw new Error(`No client with code ${code} exists, so nothing was changed.`)
    }

    const clientId = profile.id
    const clientName = profile.record.name
    const reason = input.reason?.trim() || null
    const liveFlagId = await liveBlockedFlagId(clientId)

    let flagId: string

    if (input.blocked) {
      if (liveFlagId) {
        // Not a silent no-op: the operator asked for a change and there is none
        // to make, and the partial unique index would reject the insert anyway.
        throw new Error(`${clientName} (${code}) is already blocked, so nothing was changed.`)
      }

      const payload: BlockFlagInsert = {
        client_uuid: input.clientUuid as string,
        client_id: clientId,
        flag_type: 'Blocked',
        source: 'Manual',
        // `validate` has already refused anything shorter than ten characters.
        reason: reason as string,
        created_by: ctx.userId,
      }

      let inserted
      try {
        /*
         * `'client_flags' as never` — `client_flags` is absent from
         * `src/types/database.ts` entirely (that file hand-declares 21 tables;
         * the accurate generated types are `src/types/supabase.ts`). Same cast,
         * same reason, as `lib/booqable/sync.ts:1772`. `BlockFlagInsert` above
         * is what typechecks the payload.
         * TODO(refactor): add `client_flags` to `src/types/database.ts` and drop
         * the cast. Out of this task's files.
         *
         * `insertViaSourceSwitch` is not used because it would only delegate:
         * `resolveDataSource('client_flags')` is `'os-native'` — the table is on
         * neither Booqable list.
         */
        inserted = await idempotentInsert('client_flags' as never, payload as never)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('client_flags_one_live_per_kind')) {
          throw new Error(
            `${clientName} (${code}) was blocked by someone else a moment ago, so nothing was changed.`,
          )
        }
        if (message.includes('client_flags_manual_requires_actor') || message.includes('created_by')) {
          throw new Error(
            'The signed-in user has no row in the users table, so the database refused to record who applied ' +
              'this block. Nothing was changed.',
          )
        }
        if (message.includes('client_flags_client_uuid_key')) {
          throw new Error('This block was already recorded by an earlier press. Nothing was written twice.')
        }
        throw new Error(message)
      }

      /* ── PERSISTENCE CHECK — see recordPayment for the full reasoning.
       * `idempotentInsert` returns the payload it SENT on its two queue
       * branches, and that payload has no `id`: the column is
       * `default gen_random_uuid()` and only Postgres fills it. */
      const persisted = inserted.data as unknown as { id?: string } | null
      if (inserted.error) {
        throw new Error(
          `The block could not be confirmed against the database, so treat it as not applied: ${
            (inserted.error as { message?: string }).message ?? String(inserted.error)
          }`,
        )
      }
      if (!persisted || typeof persisted.id !== 'string') {
        throw new Error(
          'The block was queued rather than written, so the database is not enforcing it yet. Check the ' +
            'connection and try again.',
        )
      }
      flagId = persisted.id
    } else {
      if (!liveFlagId) {
        throw new Error(`${clientName} (${code}) is not blocked, so there is nothing to lift.`)
      }

      const removal: BlockFlagRemoval = {
        // Device UTC. The row's `created_at` is server-side (`default now()`),
        // but PostgREST cannot send `now()` in an UPDATE payload, so removal is
        // stamped here. Law 7 — AD, in UTC, never a local wall clock.
        removed_at: new Date().toISOString(),
        removed_by: ctx.userId,
        removal_reason: reason,
      }

      /*
       * Law 3, in one line: this is an UPDATE, and there is no `.delete()`
       * anywhere in this file. `client_flags` is not on `safeUpdate`'s immutable
       * list, so the update is permitted; `clientUuid` is passed as the ACTION
       * key for the offline envelope and is deliberately not written into the
       * row (see `dataAccess.ts:66-87`).
       */
      const updated = await safeUpdate(
        'client_flags' as never,
        liveFlagId,
        { ...removal } as never,
        input.clientUuid as string,
      )

      const persisted = updated.data as unknown as { id?: string; removed_at?: string | null } | null
      if (updated.error) {
        throw new Error(
          `The block could not be lifted: ${
            (updated.error as { message?: string }).message ?? String(updated.error)
          }`,
        )
      }
      if (!persisted || typeof persisted.removed_at !== 'string') {
        throw new Error(
          'The unblock was queued rather than written, so the database is still enforcing the block. Check ' +
            'the connection and try again.',
        )
      }
      flagId = persisted.id ?? liveFlagId
    }

    const events = [
      {
        type: EVENT_TYPES.CLIENT_STATUS_UPDATED,
        payload: {
          clientId,
          clientCode: code,
          blocked: input.blocked,
          reason,
          flagId,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: { clientId, clientCode: code, clientName, blocked: input.blocked, flagId },
      events,
    }
  },
}

export const blockClient = createAction(blockClientConfig)
