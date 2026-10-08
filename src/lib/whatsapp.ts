/**
 * **WhatsApp deep links — a compose link, never a send.**
 *
 * `WHATSAPP_LINKS_SPEC_v1.0` §1. This module builds a `wa.me` URL that opens
 * WhatsApp with a message already typed. **The staff member presses Send.** We
 * have no API, no webhook and no delivery receipt, so nothing here may ever be
 * recorded as "sent" — see the honesty rule in the spec's §1 and `logPrepared`
 * below. It is the zero-infrastructure bridge until the Communication Center's
 * Cloud API lands; `whatsappTemplates.ts` is deliberately transport-agnostic so
 * those templates migrate unchanged when it does.
 *
 * ## Why a phone number is a parsing problem
 *
 * Nepal dials a 10-digit mobile (`98…`), and `wa.me` requires the full
 * international form with no `+`, no spaces and no dashes. The store holds
 * whatever was typed at the counter. So the normalisation below is the whole
 * mechanism, and its failure case matters more than its success case: a link
 * built on a wrong number opens a chat with a stranger, which is worse than
 * offering no link at all. When the number cannot be trusted this returns
 * `null` and the caller must render its control **disabled with the reason
 * inline** (Law 12 — errors inline and persistent, never a toast).
 */

/** The country code every local 10-digit mobile is missing. */
const NEPAL_CC = '977'

/**
 * Shortest string we will treat as a dialable international number. Eight is
 * the floor for the shortest national numbering plans in use; below it the
 * input is a typo, an extension or a placeholder, not a phone number.
 */
const MIN_INTERNATIONAL_DIGITS = 8

/** A local mobile/landline, before the country code is attached. */
const NEPAL_NATIONAL_DIGITS = 10

/**
 * Normalise a typed phone number to the digits `wa.me` expects, or `null` when
 * the input cannot be trusted (spec §1).
 *
 * Exported separately from `buildWaLink` so a caller can ask *"is there a
 * usable number?"* — to decide whether a button is enabled — without also
 * having to render a message body it may not be allowed to see. That split
 * matters for Law 6: the enabled/disabled decision is not a money decision,
 * but the message body can be.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')

  /* Already international. Trust it as typed rather than re-deriving a country
     code we would only be guessing at — a number stored with 977 was stored
     that way deliberately. */
  if (digits.startsWith(NEPAL_CC)) {
    return digits.length > NEPAL_CC.length ? digits : null
  }

  /* The ordinary local case: exactly ten digits is a Nepali number missing its
     country code. Only exactly ten — nine or eleven is a mistyped number, and
     padding or truncating one would invent a recipient. */
  if (digits.length === NEPAL_NATIONAL_DIGITS) return `${NEPAL_CC}${digits}`

  /* A foreign client (a visiting production, a rental partner) whose number is
     already in international form without our country code. Long enough to be
     real, so pass it through as typed; short enough to be junk, so refuse. */
  return digits.length >= MIN_INTERNATIONAL_DIGITS ? digits : null
}

/**
 * Build the `wa.me` compose link, or `null` when the number is unusable.
 *
 * `null` is not an error state to report — it is the signal to render the
 * calling control DISABLED with the inline reason (spec §1, §3). Callers should
 * use {@link NO_PHONE_REASON} so the wording is identical everywhere.
 *
 * The text is `encodeURIComponent`-escaped, which is what carries the
 * templates' newlines (`%0A`) and any `&` in a project name through the query
 * string intact — see the round-trip test.
 */
export function buildWaLink(phone: string | null | undefined, text: string): string | null {
  const number = normalisePhone(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

/**
 * The single wording for an unusable number, so the Booking Detail overflow,
 * the payment toast and anything added later cannot drift apart on it.
 */
export const NO_PHONE_REASON = 'No valid phone on this client — add one on the client record first.'

/**
 * Open a composed link. Kept here rather than inlined at call sites so the
 * `noopener` pair is not forgotten: `wa.me` is a third-party origin, and a tab
 * opened without it can reach back through `window.opener`.
 *
 * Returns whether a window was opened, so a caller can tell a blocked popup
 * from a successful hand-off instead of silently claiming success.
 */
export function openWaLink(url: string): boolean {
  if (typeof window === 'undefined') return false
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  return win !== null
}
