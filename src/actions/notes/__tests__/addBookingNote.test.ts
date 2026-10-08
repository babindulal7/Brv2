/**
 * ADD_BOOKING_NOTE — what this suite pins.
 *
 * `booking_notes` shipped in 0002 and sat writer-less until the Booking
 * Detail rework; this action is its first writer, so the pins are the seams
 * a later edit would most plausibly break:
 *
 *  1. **The write lands in `booking_notes`** with exactly the columns the
 *     table wants — `client_uuid` (Law 8), `booking_id` (the uuid, never the
 *     booking number), `note_type`, trimmed `body`, `created_by` = the actor.
 *  2. **The gate is `note.create` → `canWriteBookingDesk`** — the §4.20
 *     mirror of `booking_notes_all`. Warehouse writes; Accounts is refused
 *     BEFORE anything observable happens.
 *  3. **`'History'` is refused by name** — the enum's system-written member,
 *     never an operator's to type.
 *  4. **Law 8 is enforced, not decorative** — no key, no send; a duplicate
 *     key comes back as "nothing was written twice", not a second row.
 *  5. **A queued write is not a success** — a payload echoed back without a
 *     database-issued `id` must be reported as unconfirmed.
 *
 * Seam mocked: `lib/dataAccess` only. The dispatcher (permissions, validate,
 * event emission) runs for real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ActionPermissionError } from '../../core'
import type { AddBookingNoteInput } from '../addBookingNote'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  insertResult: { data: {} as unknown, error: null as unknown },
  insertThrows: null as string | null,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    if (access.insertThrows) throw new Error(access.insertThrows)
    return access.insertResult
  },
}))

const { addBookingNote } = await import('../addBookingNote')

const WAREHOUSE = { userId: 'usr-warehouse', role: 'Warehouse' as const }
const ACCOUNTS = { userId: 'usr-accounts', role: 'Accounts' as const }

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'
const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const input = (over: Partial<AddBookingNoteInput> = {}): AddBookingNoteInput => ({
  bookingId: BOOKING_ID,
  noteType: 'Booking',
  body: 'Client will collect from the side entrance.',
  clientUuid: KEY,
  ...over,
})

beforeEach(() => {
  access.inserts = []
  access.insertResult = { data: { id: 'note-uuid-1' }, error: null }
  access.insertThrows = null
})

describe('the write', () => {
  it('lands in booking_notes with the columns the table wants, and reports the row Postgres issued', async () => {
    const res = await addBookingNote(input({ body: '  Client will collect early.  ' }), WAREHOUSE)

    expect(access.inserts).toHaveLength(1)
    const sent = access.inserts[0]!
    expect(sent.table).toBe('booking_notes')
    expect(sent.payload).toEqual({
      client_uuid: KEY,
      booking_id: BOOKING_ID,
      note_type: 'Booking',
      body: 'Client will collect early.',
      created_by: 'usr-warehouse',
    })
    expect(res.noteId).toBe('note-uuid-1')
    expect(res.noteType).toBe('Booking')
  })

  it('writes Internal when asked — the print exclusion is the view’s job, not a reason to refuse the row', async () => {
    await addBookingNote(input({ noteType: 'Internal' }), WAREHOUSE)
    expect(access.inserts[0]!.payload['note_type']).toBe('Internal')
  })
})

describe('the gate — §4.20 mirror of booking_notes_all', () => {
  it('refuses Accounts before anything observable happens', async () => {
    await expect(addBookingNote(input(), ACCOUNTS)).rejects.toBeInstanceOf(ActionPermissionError)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses a call without a session context', async () => {
    await expect(addBookingNote(input())).rejects.toThrow(/session context/)
    expect(access.inserts).toHaveLength(0)
  })
})

describe('what may be written', () => {
  it('refuses History by name — a hand-typed trail entry is a fabricated trail', async () => {
    await expect(
      addBookingNote(input({ noteType: 'History' as unknown as 'Booking' }), WAREHOUSE),
    ).rejects.toThrow(/History/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses an empty note', async () => {
    await expect(addBookingNote(input({ body: '   ' }), WAREHOUSE)).rejects.toThrow(/empty note/)
    expect(access.inserts).toHaveLength(0)
  })
})

describe('Law 8', () => {
  it('refuses to send without an idempotency key', async () => {
    await expect(addBookingNote(input({ clientUuid: undefined }), WAREHOUSE)).rejects.toThrow(/idempotency/)
    expect(access.inserts).toHaveLength(0)
  })

  it('a replay resolves as SUCCESS with the first press’s noteId — the real seam never throws the 23505', async () => {
    /* `idempotentInsert` intercepts the client_uuid 23505 internally and
       returns the row the FIRST press committed (dataAccess.ts:134-144) —
       this models that contract: same key in, same row back, no error. */
    access.insertResult = { data: { id: 'note-uuid-1' }, error: null }
    const first = await addBookingNote(input(), WAREHOUSE)
    const replay = await addBookingNote(input(), WAREHOUSE)
    expect(replay.noteId).toBe(first.noteId)
    expect(access.inserts).toHaveLength(2) // both sends carry the SAME key…
    expect(access.inserts[0]!.payload['client_uuid']).toBe(KEY)
    expect(access.inserts[1]!.payload['client_uuid']).toBe(KEY) // …and dataAccess dedupes on it
  })

  it('surfaces the errors dataAccess DOES re-throw (an FK, here) with the named sentence', async () => {
    access.insertThrows =
      '[DataAccess] Insert failed on booking_notes: insert or update violates foreign key constraint "booking_notes_created_by_fkey"'
    await expect(addBookingNote(input(), WAREHOUSE)).rejects.toThrow(/no row in the users table/)
  })
})

describe('a queued write is not a success', () => {
  it('reports unconfirmed when the payload comes back without a database id', async () => {
    /* dataAccess's queue branches echo the SENT payload, which has no id. */
    access.insertResult = { data: { client_uuid: KEY, booking_id: BOOKING_ID }, error: null }
    await expect(addBookingNote(input(), WAREHOUSE)).rejects.toThrow(/queued rather than written/)
  })

  it('reports the database error rather than pretending', async () => {
    access.insertResult = { data: null, error: { message: 'permission denied for table booking_notes' } }
    await expect(addBookingNote(input(), WAREHOUSE)).rejects.toThrow(/treat it as not saved/)
  })
})
