import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { PHONE_STORED_RE, PHONE_REJECTION } from '../../lib/phone'

/**
 * # CREATE_CLIENT — the write
 *
 * ## What this replaced
 *
 * ```ts
 * const generatedId = issue('CL', Number(Date.now().toString().slice(-4)))
 * console.log(`[DB TX] Created client ${generatedId}: ${input.name} …`)
 * return { result: { success: true, clientId: generatedId }, events }
 * ```
 *
 * A `console.log` and a client code minted off the wall clock — which
 * `slice(-4)` recycles every ten seconds and which fails the live
 * `clients_client_code_format` CHECK outright. Nothing reached Postgres. The
 * dispatcher's `implemented` default (false) is the only reason no operator was
 * shown that success. This file is now the insert.
 *
 * ## The schema facts this body is built on
 *
 * Read from `supabase/migrations/0005_clients.sql:36-119` **and** re-read off
 * the live project's catalog on 12 Aug 2026, because the two drift (see
 * `client_code` below, which is exactly that):
 *
 * 1. `clients.client_code` is `text NOT NULL` with **no default and no
 *    BEFORE-INSERT trigger** — `trg_audit_clients` is the only trigger on the
 *    table. An insert that omits it fails 23502, not 23514. The value therefore
 *    has to come from somewhere, and `next_document_number('client')`
 *    (`0007_admin_security.sql:359`) is the only allocator: it takes
 *    `for update` on `number_sequences`, so two operators submitting in the same
 *    instant cannot be handed the same code.
 * 2. `clients.phone` is `NOT NULL`, `unique (clients_phone_key)` and carries
 *    CHECK `clients_phone_format`. 0005's own comment: *"Phone is the unique
 *    identifier, not email."* The rule lives in `lib/phone` and is reused here,
 *    never restated — `PHONE_STORED_RE` mirrors that CHECK character for
 *    character.
 * 3. `type_parent` is physically nullable and 0005 marks it *TRIGGER REQUIRED*
 *    on INSERT — **that trigger does not exist on the live project**. So a
 *    client saved without a type is accepted and surfaces in the Unassigned
 *    bucket, which is what `queries/clients.ts:toClientRecord` already renders.
 *    It is still sent when the operator picked one, because they picked one.
 *    `clients_org_subtype_pairing` then requires Organisation ⇒ subtype present
 *    and Individual ⇒ subtype absent.
 * 4. **`clients` is Booqable-mastered** — `lib/dataAccess.ts:214-218` lists it in
 *    `BOOQABLE_BRIDGE_WRITABLE_TABLES`, so `insertViaSourceSwitch('clients', …)`
 *    throws by design. The raw `idempotentInsert` is the correct call here, the
 *    same one `lib/booqable/sync.ts:1772` makes for its own client writes.
 * 5. `approved_credit_limit` and `payment_terms` are **not written here and
 *    cannot be**: 0005:162-164 — *"Written ONLY by an Approved
 *    client_commercial_overrides row. No direct UPDATE path, for any role
 *    including Owner."* Add Client collects both; the screen says plainly that
 *    they are not saved rather than dropping them silently.
 *
 * ## ⚠ TODO(decision) — `client.create` resolves to no rule in `lib/rbac`
 *
 * `actions/core.ts:105-126` can resolve seven capability strings and
 * `client.create` is not one of them, so `checkCapability` returns `undefined`
 * and the dispatcher denies this action **before** `execute` ever runs
 * (`core.ts:144-149`). That is the fail-closed direction and it is deliberate;
 * it also means this body cannot be exercised through the UI until the matrix
 * `core.ts:45-52` marks TODO(decision) is ruled.
 *
 * The rule is not actually unknown — it is already applied to the database and
 * simply has no mirror in `lib/rbac`, which is the drift rbac's own header says
 * must not exist. Read off the live project, 12 Aug 2026:
 *
 *     policy clients_insert  with check (auth_user_role() = any (array[
 *       'Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'
 *     ]))
 *
 * Writing that into `lib/rbac` is a one-function change in a file this task was
 * not given, so it is recorded here rather than invented here. `permissions`
 * below is left naming the real capability rather than being re-pointed at a
 * mapped-but-different one.
 *
 * ## ⚠ TODO(decision) — the `client_code` format mismatch (PLAN.md §4.20)
 *
 * The live CHECK is `client_code ~ '^CL-[0-9]{4}-[0-9]{4}$'` while
 * `src/data/numbering.ts` emits `C-1` under the 12 Aug identifier ruling.
 * `0055_ruled_identifier_formats.sql` moves the CHECK, the sequence rows and
 * `next_document_number()` together, and is written but **not applied**.
 *
 * This action deliberately picks neither side: it asks the database for the
 * number, so whichever format the database is configured for is the one that
 * gets written, before and after 0055. If the two halves are ever out of step
 * the insert returns a CHECK violation, and `describeInsertFailure` below turns
 * that into a sentence naming the constraint and the migration instead of an
 * unhandled 400.
 *
 * Related, and out of this task's scope: the live `clients` table already holds
 * `CL-2026-0102` while `number_sequences.current_value` for `client` is still
 * `0`, so the allocator will walk into that code and collide on
 * `clients_client_code_key` at the 102nd create. Reported, not fixed.
 */

/** `clients.type_parent` — `client_type_parent` (0001). */
export type ClientTypeParent = 'Organisation' | 'Individual'

export type CreateClientInput = {
  /** `clients.name` — one column; the label swaps by type (0005:127-128). */
  name: string
  /**
   * `clients.phone`, in the **stored** form (`+9779801234567`). Callers run
   * `lib/phone`'s `canonicalPhone()` first — this action re-checks rather than
   * re-implements, because the column's unique constraint makes a malformed
   * number a permanent bad row rather than a rejected one.
   */
  phone: string
  /** `clients.email` — nullable. Blank is stored as NULL, never as `''`. */
  email?: string | undefined
  /** `clients.type_parent`. Omitted → the client lands in the Unassigned bucket. */
  clientType?: ClientTypeParent | undefined
  /**
   * `clients.org_subtype` — a `client_organisation_subtype` member. Required by
   * CHECK when `clientType` is `'Organisation'`, forbidden when `'Individual'`.
   */
  orgSubtype?: string | undefined
  addressLine?: string | undefined
  city?: string | undefined
  district?: string | undefined
  postalCode?: string | undefined
  /** `clients.country` — NOT NULL, database default `'Nepal'`. */
  country?: string | undefined
  /** `clients.pan_vat` — CHECK: exactly nine digits, or absent. */
  panVat?: string | undefined
  notes?: string | undefined
  /**
   * **Law 8.** Minted once where the operator pressed Save (`newClientUuid()`
   * in `lib/supabase`) and reused across every retry of that one press, so a
   * double submit conflicts on `clients_client_uuid_key` instead of creating a
   * second client with a second phone-unique violation.
   *
   * Optional in the type only so the one caller this task may not edit
   * (`modules/rentals/booking/AddClientModal.tsx`) keeps compiling; `validate`
   * refuses it. `idempotentInsert` would happily mint a fresh key per call,
   * which is a duplicate client per retry — the failure Law 8 exists for.
   */
  clientUuid?: string | undefined
  /**
   * @deprecated There is no draft column anywhere on `clients` and no drafts
   * table. Accepted so existing callers passing `isDraft: false` still compile;
   * `validate` refuses `true` rather than accepting a flag it would drop.
   */
  isDraft?: boolean | undefined
}

export type CreateClientResult = {
  /** `clients.id` — the row's uuid, generated by Postgres. Never a client-side string. */
  clientId: string
  /** `clients.client_code` — allocated by `next_document_number('client')`. */
  clientCode: string
  name: string
  phone: string
}

/** The exact column set this action writes. Declared so the payload is typechecked
 *  against something true before the cast below defeats the stale hand-written type. */
type ClientInsertPayload = {
  client_uuid: string
  client_code: string
  name: string
  phone: string
  email: string | null
  type_parent?: ClientTypeParent
  org_subtype?: string
  address_line: string | null
  city: string | null
  district: string | null
  postal_code: string | null
  country: string
  pan_vat: string | null
  notes: string | null
  created_by: string
}

/** Trimmed, or null — a blank optional column is NULL, never an empty string. */
function orNull(v: string | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

/**
 * Turn a Postgres failure into something an operator can act on.
 *
 * `idempotentInsert` reports failure by throwing an `Error` whose message is
 * `[DataAccess] Insert failed on clients: <postgres message>` — the error CODE
 * is not carried through, so the constraint name inside the message is the only
 * signal available. Each branch below names a constraint that is live on the
 * project today; anything unmatched is re-thrown verbatim rather than replaced
 * with a friendlier sentence that hides what actually happened.
 */
function describeInsertFailure(message: string, input: CreateClientInput, clientCode: string): string {
  if (message.includes('clients_phone_key')) {
    return (
      `A client with phone ${input.phone} already exists, and phone is the unique identifier for a client ` +
      `(0005:131-132). Nothing was saved — open the existing client instead, or correct the number.`
    )
  }
  if (message.includes('clients_phone_format')) {
    return `${PHONE_REJECTION} The number ${input.phone} was refused by the database, so nothing was saved.`
  }
  if (message.includes('clients_client_code_format')) {
    return (
      `The database allocated the client code ${clientCode}, and its own clients_client_code_format CHECK ` +
      `rejected it, so nothing was saved. The number sequence and the CHECK are out of step — ` +
      `migration 0055_ruled_identifier_formats.sql moves both together and has not been applied ` +
      `(PLAN.md §4.20). This needs a migration, not a retry.`
    )
  }
  if (message.includes('clients_client_code_key')) {
    return (
      `The client code ${clientCode} is already taken, so nothing was saved. The 'client' number sequence ` +
      `is behind the codes already in the table and is re-issuing them. This needs the sequence corrected, ` +
      `not a retry.`
    )
  }
  if (message.includes('clients_pan_vat_nine_digits')) {
    return `PAN/VAT must be exactly nine digits. Nothing was saved.`
  }
  if (message.includes('clients_org_subtype_pairing')) {
    return (
      `An Organisation must carry an organisation type and an Individual must not, and this client carried ` +
      `the wrong combination. Nothing was saved.`
    )
  }
  if (message.includes('clients_client_uuid_key')) {
    // Reachable only if the re-select inside idempotentInsert also failed.
    return `This client was already saved by an earlier submit of the same form. Nothing was saved twice.`
  }
  if (message.includes('created_by') || message.includes('clients_created_by')) {
    return (
      `The signed-in user has no row in the users table, so the database refused to record who created this ` +
      `client. Nothing was saved.`
    )
  }
  return message
}

/**
 * The config, exported alongside the dispatched action.
 *
 * Not a convenience. `client.create` resolves to nothing in `checkCapability`,
 * so **every** call through `createClient` below throws `ActionPermissionError`
 * before `validate` or `execute` runs — which would leave this body with no way
 * to be exercised at all, and "untested because unreachable" is how a write
 * body rots between the day it is written and the day the capability matrix
 * lands. `__tests__/createClient.test.ts` drives `validate`/`execute` through
 * this handle, and pins the denial separately through `createClient` itself, so
 * whoever rules the matrix has an executable statement of both facts.
 */
export const createClientConfig: ActionConfig<CreateClientInput, CreateClientResult> = {
  name: 'CREATE_CLIENT',
  // Left naming the real capability. See the TODO(decision) in the header: the
  // rule exists in RLS and has no mirror in `lib/rbac`, and inventing one in a
  // file this task was not given is the product decision CLAUDE.md forbids.
  permissions: ['client.create'],

  /**
   * `true` because `execute` below inserts into `clients` through
   * `lib/dataAccess`'s `idempotentInsert` and then verifies a uuid came back
   * from Postgres. See the PERSISTENCE CHECK block.
   *
   * ⚠ The write was driven against the live project as SQL, inside a
   * PL/pgSQL block aborted by `raise exception` so nothing committed
   * (`next_document_number('client')` → `CL-2026-0001`, insert accepted, the
   * sequence left at 0). It could **not** be driven through the UI, because the
   * dispatcher denies `client.create` before `execute` runs — see the header.
   */
  implemented: true,

  validate: (input) => {
    if (!input.name || input.name.trim() === '') {
      throw new Error('A client must have a name.')
    }
    if (!input.phone || input.phone.trim() === '') {
      throw new Error('A client must have a phone number — it is the unique identifier a client is matched on.')
    }
    if (!PHONE_STORED_RE.test(input.phone.trim())) {
      // The one wording, from `lib/phone`. Three screens create clients and may
      // not each explain the same rejection differently.
      throw new Error(PHONE_REJECTION)
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error(
        'This client carries no idempotency key, so a retry could create a second client with the same phone. ' +
          'Nothing was sent.',
      )
    }
    if (input.isDraft === true) {
      throw new Error(
        'Draft clients have nowhere to be stored — `clients` has no draft column and there is no drafts table. ' +
          'Nothing was sent.',
      )
    }
    if (input.clientType === 'Organisation' && !input.orgSubtype?.trim()) {
      throw new Error('An Organisation must state what kind of organisation it is.')
    }
    if (input.clientType === 'Individual' && input.orgSubtype?.trim()) {
      throw new Error('An Individual cannot carry an organisation type.')
    }
    const pan = input.panVat?.trim()
    if (pan && !/^[0-9]{9}$/.test(pan)) {
      throw new Error('PAN/VAT must be exactly nine digits.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused, not queued.
     *
     * `idempotentInsert` queues an offline insert and returns
     * `{ data: <the payload you sent>, error: null }` (`dataAccess.ts:39-43`),
     * which has no `id` and no `client_code` the database agreed to. Handing
     * that back as a created client would show the operator a client code the
     * registry has never issued, and Add Client navigates away on success. A
     * create is refused offline instead.
     */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. A new client is not queued for later — the client code comes from the ' +
          'database and cannot be issued here. Save it when you are back online.',
      )
    }

    /*
     * The code from the database's allocator, never from the clock.
     *
     * ⚠ A retry re-enters this RPC BEFORE the insert, so a replay that then
     * conflicts on `client_uuid` has burned a sequence value and writes no row.
     * Gaps in `client_code` are therefore possible and are not a defect — the
     * same caveat `recordPayment` records for `payment_no`.
     */
    const { data: clientCode, error: numberError } = await supabase.rpc('next_document_number', {
      p_sequence_key: 'client',
    })

    if (numberError) {
      throw new Error(`Could not allocate a client code, so nothing was saved: ${numberError.message}`)
    }
    if (!clientCode) {
      throw new Error('next_document_number returned no client code, so nothing was saved.')
    }

    const payload: ClientInsertPayload = {
      client_uuid: input.clientUuid as string,
      client_code: clientCode as string,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: orNull(input.email),
      // Spread rather than assigned: `exactOptionalPropertyTypes` is on, and an
      // absent type must be ABSENT from the payload, not present-and-undefined.
      ...(input.clientType ? { type_parent: input.clientType } : {}),
      ...(input.clientType === 'Organisation' && input.orgSubtype?.trim()
        ? { org_subtype: input.orgSubtype.trim() }
        : {}),
      address_line: orNull(input.addressLine),
      city: orNull(input.city),
      district: orNull(input.district),
      postal_code: orNull(input.postalCode),
      // NOT NULL with a database default; only sent when the operator supplied one.
      country: input.country?.trim() || 'Nepal',
      pan_vat: orNull(input.panVat),
      notes: orNull(input.notes),
      created_by: ctx.userId,
      /*
       * Deliberately NOT written, each for a stated reason:
       *  - approved_credit_limit / payment_terms — 0005:162-164, writable only
       *    through an Approved `client_commercial_overrides` row.
       *  - preferred_contact_channels — the screen offers 'Phone', which is not
       *    a member of the `preferred_contact_channel` enum
       *    (Email | SMS | WhatsApp | Push). Sending it is a 22P02; mapping it
       *    onto a different channel is inventing the operator's answer. The
       *    column keeps its `{WhatsApp}` default.
       *  - membership tier — `client_memberships`, a different table.
       *  - status — defaults to 'Active'. 'Blocked' is never a status
       *    (0005:149-150); it is a `client_flags` row, see `blockClient.ts`.
       *  - client_since — defaults to `current_date` on the server. Law 7: the
       *    database's clock is the one that cannot be skewed by a device.
       */
    }

    let result: Awaited<ReturnType<typeof idempotentInsert>>
    try {
      result = await idempotentInsert('clients' as never, payload as never)
    } catch (err) {
      /*
       * `'clients' as never` / `payload as never` — the same cast
       * `lib/booqable/sync.ts:1772` and `:1790` already make, and for the same
       * reason: `dataAccess` is generic over `src/types/database.ts`, whose
       * hand-written `clients` entry describes columns this table does not have
       * (`client_no`, `full_name`, `mobile`, `address`, `is_blocked`). The
       * accurate generated types are in `src/types/supabase.ts`.
       * `ClientInsertPayload` above is what actually typechecks the payload, so
       * the cast defeats a wrong type rather than a right one.
       * TODO(refactor): correct the `clients` entry in `src/types/database.ts`
       * against the live catalog and drop both casts. Out of this task's files.
       */
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(describeInsertFailure(message, input, clientCode as string))
    }

    /* ── PERSISTENCE CHECK ──────────────────────────────────────────────────
     * `idempotentInsert` throws on a real failure, but two of its branches
     * return successfully having written nothing: the offline queue (guarded
     * above) and the `'Failed to fetch'`/408 network branch (`:49-53`), which
     * fires even when `navigator.onLine` is true. Both return the payload that
     * was SENT, which carries no `id` — that column is
     * `default gen_random_uuid()` and only Postgres fills it. A third branch
     * (`:56-58`, the Law 8 replay) returns the raw PostgREST result, so unlike
     * every other path its `error` can be non-null.
     */
    const persisted = result.data as unknown as { id?: string; client_code?: string } | null
    if (result.error) {
      throw new Error(
        `The client could not be confirmed against the database, so treat it as not saved: ${
          (result.error as { message?: string }).message ?? String(result.error)
        }`,
      )
    }
    if (!persisted || typeof persisted.id !== 'string') {
      throw new Error(
        'The client was queued rather than written — the database has not confirmed it, so it has no client ' +
          'code yet. Check the connection and save it again.',
      )
    }

    const savedCode = persisted.client_code ?? (clientCode as string)

    const events = [
      {
        type: EVENT_TYPES.CLIENT_CREATED,
        payload: {
          clientId: persisted.id,
          clientCode: savedCode,
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
          clientType: input.clientType ?? null,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        clientId: persisted.id,
        clientCode: savedCode,
        name: payload.name,
        phone: payload.phone,
      },
      events,
    }
  },
}

export const createClient = createAction(createClientConfig)
