/**
 * Client phone numbers — one rule, one place.
 *
 * `clients.phone` carries a hard database CHECK —
 * `supabase/migrations/0005_clients.sql:91`:
 *
 *     constraint clients_phone_format check (phone ~ '^\+977(97|98)[0-9]{8}$')
 *
 * Only 97/98 prefixes are legal and the stored value carries the country code.
 * An operator cannot see that rule, so every surface that accepts a phone must
 * state it and enforce it — otherwise a number that looks perfectly fine is
 * rejected by an invisible constraint at insert time.
 *
 * ## Why this is a module and not three copies
 *
 * Law 1 — *pages never implement business logic; the engines own it.* Three
 * screens create clients (`modules/clients/AddClient`, the booking-side
 * `modules/rentals/booking/AddClientModal`, and the CSV path through
 * `lib/clientImport`) and each had its own answer to "what is a valid phone":
 * two spellings of `/^9\d{9}$/` that accepted 96/95/90 numbers the database
 * rejects, and one correct copy. `AddClient` is `@ts-nocheck`, so nothing
 * typechecked the difference. The rule lives here so a fourth surface inherits
 * it instead of inventing a fourth answer.
 *
 * `lib/booqable/map/clients.ts` deliberately keeps its own copy — that file
 * states a self-containment convention for the whole mapper, its
 * `normalizeClientPhone` handles free-text from a foreign system rather than a
 * typed field, and it already routes non-conforming numbers to a conflict
 * queue. Left alone on purpose.
 *
 * ## What normalisation is allowed to do
 *
 * Only formatting is removed — spaces, hyphens, brackets, dots — plus a
 * `+977`/`977` country code pasted on top of a prefix the field already shows.
 * **Nothing else is rewritten.** A leading `0`, a 9-digit number or a landline
 * is *rejected with a reason*, never silently reshaped into a different number:
 * saving somebody a keystroke is not worth dialling a stranger on pickup day.
 */

/** A domestic mobile with the country code stripped — what an operator types. */
export const PHONE_LOCAL_RE = /^(97|98)\d{8}$/

/** The stored form. Mirrors the CHECK in migration 0005 character for character. */
export const PHONE_STORED_RE = /^\+977(97|98)[0-9]{8}$/

/**
 * The one wording for a rejected number, so the same miss cannot be explained
 * three different ways depending on which screen the operator happened to use.
 */
export const PHONE_REJECTION =
  'Must be a 10-digit Nepali mobile starting 97 or 98 — for example 9801234567.'

/** Strips formatting and a redundant country code. Never alters the digits themselves. */
export function phoneLocalDigits(raw: string): string {
  return raw.replace(/[\s\-().]/g, '').replace(/^(?:\+977|977)/, '')
}

/** True when what was typed is a phone number the database will accept. */
export function isValidLocalPhone(raw: string): boolean {
  return PHONE_LOCAL_RE.test(phoneLocalDigits(raw))
}

/**
 * The exact string that will be stored. Only meaningful for input that has
 * passed `isValidLocalPhone` — callers validate first and show this back to the
 * operator, so nobody is surprised by what landed in the record.
 */
export function canonicalPhone(raw: string): string {
  return `+977${phoneLocalDigits(raw)}`
}
