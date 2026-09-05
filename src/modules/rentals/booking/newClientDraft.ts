import { rupees } from '../../../lib/money'
import { normalizedPhone } from '../../../data/clients'
import type { ClientRecord, ClientType, MembershipTier, OrganisationType } from '../../../data/clients'
import type { CreateClientInput, CreateClientResult } from '../../../actions/clients/createClient'

/**
 * **What a client created from a booking actually saves — and what it does not.**
 *
 * Extracted from `AddClientModal.tsx` so the two questions that decide whether
 * that dialog tells the truth are pure, readable and testable:
 *
 *  1. **What goes to the database** (`createClientInputFrom`) — the column set
 *     `actions/clients/createClient.ts` writes, and nothing else.
 *  2. **What the booking page is then told** (`clientRecordFrom`) — a
 *     `ClientRecord` carrying only values the database now holds, so the record
 *     handed back matches what re-reading that client would return.
 *
 * Law 1 as well: the mapping rules below are not layout, and a page is not
 * where they belong.
 *
 * ## The three fields this module deliberately has no slot for
 *
 * `AddClientModal` collects Contact Person, Credit Limit and Payment Terms.
 * None of the three can be written by the create path, and `NewClientDraft`
 * below has no field for any of them so that they cannot be smuggled in:
 *
 *  - **Contact Person** — there is no contact column on `clients`. A contact is
 *    a row in `client_contacts` (`0005_clients.sql`), a different table;
 *    `createClient.execute` inserts into `clients` alone and its
 *    `ClientInsertPayload` names no contact column.
 *  - **Credit Limit** → `clients.approved_credit_limit`, and **Payment Terms**
 *    → `clients.payment_terms`. `0005_clients.sql`'s own comment on the pair:
 *    *"Written ONLY by an Approved client_commercial_overrides row. No direct
 *    UPDATE path, for any role including Owner."* `CreateClientInput` has no
 *    parameter for either, which is that rule expressed in the type.
 *
 * `paymentTerms` has a second, independent problem worth recording where the
 * next reader will find it: `PAYMENT_TERMS_OPTIONS` in `data/clients.ts` offers
 * `Due on Pickup · Due on Return · Net 7 · Net 15 · Net 30 · Prepaid · Custom`,
 * while the stored `payment_terms` enum (`0001_enums.sql:845`) is
 * `Immediate · 7 days · 15 days · 30 days`. **Not one option the operator can
 * pick is a member of the stored type.** Even with an approval path in place,
 * the list would have to be mapped or re-ruled first.
 */

/* ── defaults for a freshly created record ───────────────────────────────
 *
 * The first two match what `modules/clients/AddClient.tsx` already defaults to
 * (`useState<ClientType>('Organisation')` and `useState<MembershipTier>('Creator')`),
 * so a client created from a booking and a client created from the Clients
 * module come out identical. Neither is a new product decision made here.
 */
export const DEFAULT_CLIENT_TYPE: ClientType = 'Organisation'

/**
 * ⚠ **TODO(decision) — nothing writes a `client_memberships` row.**
 *
 * `membership` is required on `ClientRecord` and has no way to spell "has not
 * joined anything", so a value has to go here. This one is not measured: a
 * client created by this dialog holds no membership row at all, because a tier
 * is a row in `client_memberships` and neither `createClient` nor this module
 * writes one. `queries/clients.ts` hits the same wall from the other side and
 * puts `UNJOINED_MEMBERSHIP_PLACEHOLDER` ('Academy') there, documenting it as
 * "a fabricated fact on a real record" pending a `'None'` member on
 * `MembershipTier`.
 *
 * Left at 'Creator' rather than switched, because the two placeholders are
 * different tiers and choosing between them moves pricing — that is the ruling,
 * not a refactor. `AddClientModal`'s confirmation therefore states that the
 * tier is not stored rather than presenting it as saved.
 */
export const DEFAULT_MEMBERSHIP: MembershipTier = 'Creator'

/** Mirrors `AddClient.tsx`'s own `orgType` default. */
export const DEFAULT_ORGANISATION_TYPE: OrganisationType = 'Production House'

/**
 * `clients.org_subtype` — every member of the `client_organisation_subtype`
 * enum (`0001_enums.sql:796`), in the enum's own order.
 *
 * The list is duplicated from `AddClient.tsx`'s local `ORG_TYPES` only because
 * neither `data/clients.ts` nor anywhere else exports one; the closed
 * `OrganisationType` union types both copies, and
 * `__tests__/newClientDraft.test.ts` reads the migration and fails if this
 * array and the enum ever drift apart.
 */
export const ORGANISATION_TYPES: readonly OrganisationType[] = [
  'Production House',
  'Rental House',
  'College / Institution',
  'Corporate / Agency',
  'Government / NGO',
  'Broadcaster',
  'Other',
]

/** Exactly the fields a client created from a booking can be saved with. */
export interface NewClientDraft {
  clientType: ClientType
  /**
   * Required by CHECK `clients_org_subtype_pairing` whenever the type is
   * Organisation, and forbidden when it is Individual — so it is carried
   * always and sent conditionally.
   */
  organisationType: OrganisationType
  name: string
  /** The **stored** form, `+9779801234567`. Callers run `canonicalPhone()` first. */
  phone: string
  email: string
  /** `clients.pan_vat` — CHECK: exactly nine digits, or absent. */
  pan: string
  notes: string
}

/**
 * The payload for `createClient`.
 *
 * `clientType` is narrowed rather than cast: `ClientType` carries a third
 * member, `'Unassigned'`, which `clients.type_parent` has no enum member for.
 * The dialog's two-button toggle cannot produce it, but the type can, and an
 * absent value lands the client in the Unassigned bucket honestly instead of
 * sending a member the database does not have.
 */
export function createClientInputFrom(draft: NewClientDraft, clientUuid: string): CreateClientInput {
  const typed = draft.clientType === 'Organisation' || draft.clientType === 'Individual'
  return {
    name: draft.name.trim(),
    phone: draft.phone,
    email: draft.email.trim(),
    ...(typed ? { clientType: draft.clientType as 'Organisation' | 'Individual' } : {}),
    ...(draft.clientType === 'Organisation' ? { orgSubtype: draft.organisationType } : {}),
    panVat: draft.pan.trim(),
    notes: draft.notes.trim(),
    isDraft: false,
    clientUuid,
  }
}

/**
 * The record handed to the booking page — **only** what the row now holds.
 *
 * Every placeholder below is either a value the database applied itself or the
 * same stand-in `queries/clients.ts:toClientRecord` produces for a client with
 * no such data, so selecting this client and re-reading it later do not
 * disagree:
 *
 *  - `creditLimitPaisa: 0` — `approved_credit_limit` is left NULL on insert and
 *    `toClientRecord` maps NULL to `0 as Paisa`.
 *  - `contactPerson` em-dashes — `toClientRecord` writes `'—'` for each of the
 *    three when the client has no `client_contacts` row, and a client created
 *    here has none.
 *  - `paymentTerms` **absent** — the column takes its `'Immediate'` default, and
 *    `toClientRecord` does not publish it at all, so absent is what a re-read
 *    gives.
 *  - `clientSinceAd` **absent** — `clients.client_since` defaults to
 *    `current_date` **on the server**, which `createClient` returns nothing of.
 *    Stamping the device's own date here would assert a date nobody read back;
 *    `ClientHistoryDrawer` already renders the absence as "Not recorded on this
 *    client." rather than a number. (Law 7 is not the reason — it is satisfied
 *    either way; the reason is that the value is unknown to this process.)
 */
export function clientRecordFrom(draft: NewClientDraft, saved: CreateClientResult): ClientRecord {
  const pan = draft.pan.trim()
  const notes = draft.notes.trim()
  return {
    /* The client CODE, like every other `ClientRecord.id` on screen … */
    id: saved.clientCode,
    /* … and the `clients.id` uuid, which is what the booking write needs.
       Without it the booking page auto-selects this record and Confirm
       refuses it as sample data (`!client?.dbId`). */
    dbId: saved.clientId,
    name: saved.name,
    clientType: draft.clientType,
    ...(draft.clientType === 'Organisation' ? { organisationType: draft.organisationType } : {}),
    membership: DEFAULT_MEMBERSHIP,
    phone: saved.phone,
    email: draft.email.trim(),
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(0),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '—',
    lastRentalBs: '—',
    address: '',
    contactPerson: { name: '—', designation: '—', phone: '—' },
    kycStatus: 'Not Submitted',
    kycDocsCount: 0,
    totalRentalsCount: 0,
    totalSpentPaisa: rupees(0),
    ...(pan ? { pan } : {}),
    ...(notes ? { notes } : {}),
  }
}

/**
 * The clients a duplicate can actually be found among — the ones the database
 * has confirmed, i.e. the ones carrying a `dbId`.
 *
 * `ClientRecord.dbId` is populated **only** by `queries/clients.ts:toClientRecord`
 * (its own doc comment says so), so a row without one came from the seed array
 * in `data/clients.ts` and describes no client the business has. Announcing
 * "this phone number is already on file" from such a row states a fact about
 * demo data as though it were a fact about the client list.
 *
 * This is not belt-and-braces against a caller that forgets to pass a pool.
 * `NewRental.tsx` keeps `clientPool` seeded from `CLIENTS_DATA` and swaps it for
 * live rows only `if (bookableClients.length > 0)` — so even a caller doing
 * everything right hands over seed rows whenever the read fails or comes back
 * empty, which is exactly when a false duplicate would be most confusing.
 */
export function confirmedClients(pool: readonly ClientRecord[] | undefined): readonly ClientRecord[] {
  return pool ? pool.filter((c) => Boolean(c.dbId)) : []
}

/**
 * The client already on file under this phone number, if there is one.
 *
 * `normalizedPhone` is the shared normalizer from `data/clients` — the same one
 * the Duplicate/Merge Center and `lib/clientImport` use, so a number cannot
 * match here and miss there. A merged-away record is skipped: Law 3 keeps it in
 * the list, but it is not the client to send the operator to.
 */
export function findPhoneDuplicate(
  pool: readonly ClientRecord[],
  storedPhone: string,
): ClientRecord | null {
  const digits = normalizedPhone(storedPhone)
  if (!digits) return null
  return pool.find((c) => !c.mergedIntoId && normalizedPhone(c.phone) === digits) ?? null
}
