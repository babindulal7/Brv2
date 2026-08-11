import { ROWS } from './rentals'
import type { RentalRow } from './rentals'

/**
 * Production seed data — Hover Intel System v2.1, Tier 3.
 *
 * Production does not exist anywhere in this build yet: RentalsList.tsx's
 * Productions tab rendered an explicit `<Placeholder>` stub, and no
 * `data/*.ts` file models "a production" as a concept. This is the first
 * pass at that shape.
 *
 * ── GROUNDING — a documented judgment call ──────────────────────────────
 *
 * The wave brief that requested this file says to build productions "by
 * GROUPING real existing bookings that already share a client in
 * data/rentals.ts (e.g. a client with 2+ rows in ROWS)", and names
 * "Himalayan Mountain Media" and "Kathmandu Cinema Works" as two clients
 * known to have multiple active bookings — but flags that this needs
 * re-verifying against the current file rather than trusting the note.
 *
 * Re-verified: it does not hold. Every one of the 8 rows in `ROWS` below
 * names a *different* client — no client has 2+ rows in `ROWS` by ROWS's
 * own `client` field.
 *
 * `data/clients.ts`'s `CLIENTS_DATA` *does* list multiple `activeBookings`
 * for those two clients, and some of those booking numbers really do exist
 * in `ROWS` (`Himalayan Mountain Media` claims `BK-2026-0710`,
 * `BK-2026-0712` and `BK-2026-0714` — all three real `ROWS` numbers). But
 * `ROWS` attributes those same three bookings to three different clients
 * (`Vision Production`, `White Peak Docs`, `City Motion`). This is a
 * pre-existing, already-documented seed inconsistency, not something new
 * discovered here — see the comment above `findClientIdByBooking` in
 * `clients.ts`: "`CLIENTS_DATA` ... and `data/rentals.ts` ... carry disjoint
 * client *names* for the same booking ... a Job/Case's own `client` string
 * is not a reliable way to find the real client record." The one place that
 * already resolves this (`OperationsQueues.tsx`, via `findClientIdByBooking`)
 * never relabels a row's own `client` string from the cross-reference — it
 * only uses the resolved id to *opportunistically link* to a client detail
 * page, and falls back to the row's own name when nothing resolves.
 *
 * Relabelling a `ROWS` booking's client here to force a multi-booking
 * grouping would go further than that precedent: it would show one client
 * name on the Bookings tab for a booking number and a different client name
 * for the same number on the Productions tab, on the same screen. Rather
 * than invent a new resolution rule to paper over that, every production
 * below groups only real `ROWS` bookings that share `ROWS`'s own `client`
 * field — and since none currently do, each of the three productions below
 * covers exactly one real, `ROWS`-verified booking. `linkedBookingIds` stays
 * `string[]` (not a single id) because a future pass that adds same-client
 * bookings to `ROWS` should not need a shape change here.
 */

export interface ProductionRecord {
  id: string
  name: string
  client: string
  /** Earliest linked booking's pickup. */
  startAd: Date
  /** Latest linked booking's return. */
  endAd: Date
  /** Real `RentalRow.bookingNo` values from `data/rentals.ts`'s `ROWS` only. */
  linkedBookingIds: string[]
}

function rowsFor(ids: readonly string[]): RentalRow[] {
  return ids.map((id) => ROWS.find((r) => r.bookingNo === id)).filter((r): r is RentalRow => r !== undefined)
}

/** Earliest pickup → latest return across a production's own linked `ROWS` rows. */
function spanOf(ids: readonly string[]): { startAd: Date; endAd: Date } {
  const rows = rowsFor(ids)
  const pickups = rows.map((r) => r.pickup.ad.getTime())
  const returns = rows.map((r) => r.ret.ad.getTime())
  return { startAd: new Date(Math.min(...pickups)), endAd: new Date(Math.max(...returns)) }
}

/**
 * `data/numbering.ts`'s `SEQUENCES` is "the ID registry of record" per its
 * own header, and it has no `PROD`/Production row today. Minting a real
 * `PROD-YYYY-NNNN` series would be a numbering-format decision this task
 * doesn't own (Foundation Law: never invent an ID scheme to unblock
 * yourself), so `id` below is a derived display key off the production's
 * own primary booking — good enough for a React `key` and a stable string —
 * not a claim that a `PROD-` sequence is registered anywhere.
 */
function production(name: string, client: string, linkedBookingIds: [string, ...string[]]): ProductionRecord {
  const { startAd, endAd } = spanOf(linkedBookingIds)
  return { id: `PROD-${linkedBookingIds[0]}`, name, client, startAd, endAd, linkedBookingIds }
}

export const PRODUCTIONS: ProductionRecord[] = [
  // All three link to a real, crew-cross-referenced booking in
  // data/crew.ts's CREW_DATA (matched by linkedBooking) — see
  // productionIntel.ts: BK-2026-0715 has two (Bikram Rai, Sita Tamang, both
  // Confirmed), BK-2026-0710 and BK-2026-0716 have one each.
  production('ABC Films — Commercial Shoot', 'ABC Films', ['BK-2026-0715']),
  production('Creative Studio — Music Video', 'Creative Studio', ['BK-2026-0716']),
  production('Vision Production — TV Show', 'Vision Production', ['BK-2026-0710']),
]

/**
 * Reported, never thrown (a module-scope throw would blank the app before
 * React mounts) — same convention `numbering.ts`'s `SEED_ERRORS` uses. Kept
 * as a load-time guard rather than a test because this file's whole premise
 * is "every id here is real"; a future edit that types a typo'd booking
 * number should not fail silently into `Invalid Date`.
 */
export const PRODUCTION_SEED_ERRORS: string[] = PRODUCTIONS.flatMap((p) => {
  const missing = p.linkedBookingIds.filter((id) => !ROWS.some((r) => r.bookingNo === id))
  return missing.map((id) => `Production "${p.id}" links "${id}", which is not a real bookingNo in data/rentals.ts's ROWS.`)
})
