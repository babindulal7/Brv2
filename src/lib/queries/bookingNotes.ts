import { supabase } from '../supabase'
import type { ListFilters } from './listQuery'

/**
 * # Booking Notes — the read half of `booking_notes` (0002:743-772)
 *
 * The first consumer of this table since it shipped. Law 2's Single Query
 * Rule: this module owns every `supabase.from('booking_notes')` read; no
 * screen hand-rolls one.
 *
 * What deliberately is NOT here:
 *  - **No archive filter toggle.** `archived_at IS NULL` is baked in — the
 *    archive flow (the table's Law 3 terminal action) has no UI yet, so an
 *    "include archived" option would be a switch over an empty set.
 *  - **No author name.** `created_by` is a users uuid; joining `users` for a
 *    display name is a read this module doesn't own and no other query module
 *    performs today. The row carries the uuid so the join can be added where
 *    it belongs when a users read exists; the UI renders type + time, which
 *    are facts this table itself holds.
 *  - **No print/export shaping.** Internal notes are excluded from print by a
 *    database view (0002:764), never by an application flag — a print path
 *    must read that view, not this list.
 */

export type BookingNoteType = 'Booking' | 'Internal' | 'History'

export type BookingNoteRow = {
  /** `booking_notes.id` */
  id: string
  noteType: BookingNoteType
  body: string
  /** AD instant, UTC (Law 7). BS is rendered by the caller, never stored. */
  createdAtAd: string
  /** `users.id` of the author — rendered nowhere yet; see the module header. */
  createdBy: string
  /** Set when the note came from a line's Notes row action; this wave writes only booking-level notes. */
  bookingLineId: string | null
}

/** The raw shape the select below returns. `booking_notes` is absent from the
 *  hand-declared `types/database.ts` (same gap `blockClient.ts` records for
 *  `client_flags`), so the mapping is typed here instead. */
type RawNote = {
  id: string
  note_type: BookingNoteType
  body: string
  created_at: string
  created_by: string
  booking_line_id: string | null
}

/** One booking's live notes. `bookingId` is `bookings.id`, not `booking_no` —
 *  the same contract as `invoicesForBooking`. */
export function notesForBooking(bookingId: string): ListFilters {
  return {
    chips: { booking_id: [bookingId] },
    sort: { column: 'created_at', ascending: false },
  }
}

/**
 * Live (un-archived) notes, newest first — the order
 * `booking_notes_booking_recent_idx` (0002:770) exists to serve. The
 * `booking_id` comes through `ListFilters.chips` so `useList` re-keys the
 * fetch when the booking row lands, exactly as the invoices read does.
 */
export async function listBookingNotes(filters: ListFilters): Promise<{ rows: BookingNoteRow[] }> {
  const bookingId = filters.chips?.['booking_id']?.[0]
  if (!bookingId) return { rows: [] }

  const { data, error } = await supabase
    .from('booking_notes' as never)
    .select('id, note_type, body, created_at, created_by, booking_line_id')
    .eq('booking_id', bookingId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Could not read this booking's notes: ${error.message}`)
  }

  const raw = (data ?? []) as unknown as RawNote[]
  return {
    rows: raw.map((r) => ({
      id: r.id,
      noteType: r.note_type,
      body: r.body,
      createdAtAd: r.created_at,
      createdBy: r.created_by,
      bookingLineId: r.booking_line_id,
    })),
  }
}
