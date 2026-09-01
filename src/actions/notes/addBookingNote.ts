import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'

/**
 * # ADD_BOOKING_NOTE — the first write path to `booking_notes` (0002:743-772)
 *
 * The table has been live since 0002 with zero writers; the Booking Detail
 * rework (the "notes somewhere" of the 30 Aug request) is its first consumer.
 *
 * ## The capability — `note.create`, mirrored not invented
 *
 * PLAN.md §4.20's ruled method: find the RLS policy on the table the action
 * writes and mirror it. `booking_notes_all` (0024:73-76, read off the
 * migrations and confirmed against the live project 31 Aug):
 *
 *     using     (auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
 *     with check(auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
 *
 * — exactly `rbac.canWriteBookingDesk`'s BOOKING_DESK set, so `note.create`
 * resolves through that rule in `actions/core.ts` and can never be granted
 * here and denied at the row, or the reverse. (Reading notes is broader —
 * `booking_notes_select` is `auth_is_staff()` — which is why the list renders
 * for every role while the composer is desk-gated.)
 *
 * ## What may be written
 *
 *  - `note_type` is `'Booking' | 'Internal'` only. **`'History'` is refused
 *    here by name**: the enum's third member (0001:375-379) is for
 *    system-written trail entries, and an operator typing "History" rows by
 *    hand would be fabricating a trail (Law 16's direction).
 *  - `booking_line_id` is not accepted — this wave writes booking-level notes;
 *    the line-level path (the line's Notes row action, per the column comment)
 *    belongs to the screen that owns lines.
 *  - Internal notes never print or export — enforced by a database VIEW on the
 *    print path (0002:764), not by anything this action could set.
 *
 * ## Law 3 / Law 8
 *
 * There is no delete path in this file and none in the schema —
 * `revoke delete` + a raise-on-DELETE trigger (0044) make Archive the only
 * terminal action, and archiving is NOT this action's job. `client_uuid` is
 * minted where the operator pressed the button and reused across retries.
 * A double-send with the same key never reaches this file as an error:
 * `idempotentInsert` intercepts the 23505 on `booking_notes_client_uuid_key`
 * (dataAccess.ts:134-144), re-selects the row the FIRST press committed, and
 * returns it as success — so a replay resolves to the SAME `noteId`, one row,
 * no refusal. That is the satisfied idempotency guarantee, not a failure;
 * what it cannot do is honour a payload EDITED between the presses, which is
 * why the composer mints a fresh key whenever the text or the type changes.
 *
 * ## Offline — refused, not queued
 *
 * Same call as `blockClient.ts`: `dataAccess` would queue the write and hand
 * back the payload as though it had landed, and the payload has no `id` (the
 * column is `default gen_random_uuid()`), so this action cannot truthfully
 * report a persisted note. The floor's offline spec owns queued-write UX;
 * until a ruling extends it to notes, an honest refusal beats a note that
 * exists only in an outbox.
 */

export type AddBookingNoteInput = {
  /** `bookings.id` — the uuid, not the booking number. */
  bookingId: string
  noteType: 'Booking' | 'Internal'
  body: string
  /** **Law 8** — minted where the operator pressed the button, reused across retries. */
  clientUuid?: string | undefined
}

export type AddBookingNoteResult = {
  /** `booking_notes.id` — the row Postgres confirmed. */
  noteId: string
  bookingId: string
  noteType: 'Booking' | 'Internal'
}

/** The columns the insert sends. `archived_at` stays NULL (live), `created_at`
 *  is server-side `default now()` (Law 7 — never a device wall clock). */
type NoteInsert = {
  client_uuid: string
  booking_id: string
  note_type: 'Booking' | 'Internal'
  body: string
  created_by: string
}

export const addBookingNoteConfig: ActionConfig<AddBookingNoteInput, AddBookingNoteResult> = {
  name: 'ADD_BOOKING_NOTE',
  permissions: ['note.create'],

  /** `true` because `execute` writes `booking_notes` through
   *  `lib/dataAccess.idempotentInsert` and verifies the row came back with a
   *  database-issued `id` before reporting success. */
  implemented: true,

  validate: (input) => {
    if (!input.bookingId || input.bookingId.trim() === '') {
      throw new Error('A note must name the booking it belongs to.')
    }
    if (input.noteType !== 'Booking' && input.noteType !== 'Internal') {
      throw new Error(
        'A note is Booking or Internal. History rows are written by the system when something happens — ' +
          'typing one by hand would fabricate a trail.',
      )
    }
    if ((input.body ?? '').trim().length === 0) {
      // Mirrors booking_notes_body_present (0002:756) so the refusal happens
      // here with a sentence instead of at the row with a constraint name.
      throw new Error('Write the note before saving it — an empty note records nothing.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error('This note carries no idempotency key, so a retry could write it twice. Nothing was sent.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. The note was not queued — save it when you are back online so the ' +
          'database can confirm it was recorded.',
      )
    }

    const payload: NoteInsert = {
      client_uuid: input.clientUuid as string,
      booking_id: input.bookingId,
      note_type: input.noteType,
      body: input.body.trim(),
      created_by: ctx.userId,
    }

    let inserted
    try {
      /* `'booking_notes' as never` — absent from the hand-declared
       * `types/database.ts`; same cast, same reason, as `blockClient.ts`'s
       * `client_flags`. `NoteInsert` above is what typechecks the payload. */
      inserted = await idempotentInsert('booking_notes' as never, payload as never)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      /* No duplicate-key branch here on purpose: a client_uuid 23505 never
         escapes `idempotentInsert` — it is resolved inside dataAccess by
         re-selecting the committed row (see the Law 8 section above). The
         errors that DO reach this catch are the ones dataAccess re-throws. */
      if (message.includes('created_by') || message.includes('booking_notes_created_by_fkey')) {
        throw new Error(
          'The signed-in user has no row in the users table, so the database refused to record who wrote ' +
            'this note. Nothing was changed.',
        )
      }
      if (message.includes('booking_notes_booking_id_fkey')) {
        throw new Error('No booking with that id exists, so the note had nothing to attach to.')
      }
      throw new Error(message)
    }

    /* ── PERSISTENCE CHECK — same reasoning as blockClient/recordPayment:
     * `idempotentInsert` returns the payload it SENT on its queue branches,
     * and that payload has no `id`; only a row Postgres wrote carries one. */
    const persisted = inserted.data as unknown as { id?: string } | null
    if (inserted.error) {
      throw new Error(
        `The note could not be confirmed against the database, so treat it as not saved: ${
          (inserted.error as { message?: string }).message ?? String(inserted.error)
        }`,
      )
    }
    if (!persisted || typeof persisted.id !== 'string') {
      throw new Error(
        'The note was queued rather than written, so nothing confirms it was recorded. Check the ' +
          'connection and try again.',
      )
    }

    const events = [
      {
        type: EVENT_TYPES.NOTE_ADDED,
        payload: {
          noteId: persisted.id,
          bookingId: input.bookingId,
          noteType: input.noteType,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: { noteId: persisted.id, bookingId: input.bookingId, noteType: input.noteType },
      events,
    }
  },
}

export const addBookingNote = createAction(addBookingNoteConfig)
