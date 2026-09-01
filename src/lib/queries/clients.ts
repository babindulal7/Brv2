/**
 * **Clients — the first real data-access module.**
 *
 * Written 11 Aug 2026 to close the largest production blocker on record: the
 * app rendered a complete rental business out of hand-typed arrays in
 * `src/data/*.ts` while the database it shipped with held zero rows, and no
 * screen imported a query layer at all (BUG_SWEEP verdict §1, PROGRESS.md).
 *
 * WHY QUERIES LIVE HERE AND NOT IN A SCREEN
 * -----------------------------------------
 * Law 1 — pages never implement business logic — and Law 2's Single Query Rule:
 * one query module per entity, consumed by every surface, so two screens cannot
 * disagree about the same record. A component may call these functions; it may
 * not hand-roll its own `supabase.from(...)`.
 *
 * READS GO THROUGH `clients_v`, NEVER `clients`
 * --------------------------------------------
 * Law 6. `approved_credit_limit` and `payment_terms` are column-REVOKEd from
 * `authenticated` on the base table (0038), so selecting them from `clients`
 * fails outright for everyone. `clients_v` (0038, row predicate added in 0048)
 * returns them as NULL unless `auth_can_view_money()` passes. The money-blind
 * roles therefore receive a row with the field *absent*, which is the shape
 * Foundation §8.3 requires — not a masked or blurred figure the client could
 * un-blur.
 *
 * WRITES GO THROUGH THE BASE TABLE and carry a `client_uuid` (Law 8) so a
 * retried submit cannot create a second client.
 */
import { supabase, newClientUuid } from '../supabase'
import type { Database } from '../../types/supabase'
import { rupees, type Paisa } from '../money'
import { formatBsOrAd, formatAd } from '../bs'
import type { ClientRecord, MembershipTier } from '../../data/clients'

type ClientView = Database['public']['Views']['clients_v']['Row']
type ClientInsert = Database['public']['Tables']['clients']['Insert']

/**
 * A directory row, as `client_directory_v` (0052) actually returns it.
 *
 * Money fields are `Paisa | null`, and the null is load-bearing: it means "this
 * session may not see money", NOT "this client owes nothing". Rendering it as
 * Rs 0 would state something false about a real balance, which is the failure
 * mode Foundation §8.3 exists to prevent — the figure must be absent.
 *
 * The database stores money as `numeric`, i.e. rupees; `lib/money.ts` works in
 * paisa integers. The conversion happens here, once, at the boundary — never in
 * a component.
 */
export interface ClientListItem {
  id: string
  clientCode: string
  name: string
  phone: string
  email: string | null
  city: string | null
  status: ClientView['status']
  approvedCreditLimit: Paisa | null
  outstanding: Paisa | null
  depositHeld: Paisa | null
  totalPaid: Paisa | null
  activeBookingsCount: number
  totalBookingsCount: number
  /**
   * The tier the client actually holds, or `null` when they hold none.
   *
   * The null is load-bearing in the same way the money nulls above are: the
   * view's `membership_level` comes from a LEFT JOIN, so `null` means "no
   * membership row exists for this client", never "Academy". `ClientRecord`
   * cannot express that and substitutes a placeholder tier — see
   * `UNJOINED_MEMBERSHIP_PLACEHOLDER`. This field is the honest reading; prefer
   * it anywhere the answer decides pricing, a discount or a badge.
   */
  membershipLevel: MembershipTier | null
  /** AD, ISO. Law 7 — BS is rendered from this, never stored. */
  lastPickupAtAd: string | null
}

/**
 * `client_directory_v` (migration 0052) — declared by hand because the view was
 * created after `src/types/supabase.ts` was generated, so it is not in that
 * file yet. Regenerating the types will produce this same shape; when that
 * happens, replace this with
 * `Database['public']['Views']['client_directory_v']['Row']` and delete the
 * declaration rather than keeping two definitions that can drift.
 *
 * Every money field is nullable because the view NULLs it for a money-blind
 * session (Law 6), not because the value is optional.
 */
interface DirectoryRow {
  id: string
  client_code: string
  name: string
  phone: string
  email: string | null
  address_line: string | null
  city: string | null
  district: string | null
  country: string | null
  status: ClientView['status']
  client_since: string | null
  type_parent: string | null
  pan_vat: string | null
  approved_credit_limit: number | null
  outstanding_amount: number | null
  deposit_held_amount: number | null
  total_paid_amount: number | null
  active_bookings_count: number | null
  total_bookings_count: number | null
  last_pickup_at: string | null
  contact_name: string | null
  contact_designation: string | null
  contact_phone: string | null
  membership_level: MembershipTier | null
  kyc_docs_count: number | null
  kyc_verified_count: number | null
  /**
   * Law 3 — a closed account is retained and marked, never deleted. Already in
   * `DIRECTORY_COLUMNS` because `listClients` filters on it; declared here so a
   * single-record read can RENDER the fact rather than silently show a closed
   * account as an ordinary one.
   */
  deactivated_at: string | null
  /**
   * Migration 0054, appended as the view's 31st column. Derived from a live
   * `client_flags` row of type 'Blocked' — NOT from `clients.status`, which has
   * no Blocked member (0001:832). `null` is not "not blocked": the view's
   * `exists(...)` returns a real boolean for every row, so a null here would
   * mean the column was not selected.
   */
  is_blocked: boolean | null
}

/** numeric (rupees) -> Paisa, preserving null rather than collapsing it to 0. */
function toPaisa(n: number | null): Paisa | null {
  return n === null || n === undefined ? null : rupees(n)
}

function toListItem(row: DirectoryRow): ClientListItem {
  return {
    id: row.id as string,
    clientCode: row.client_code as string,
    name: row.name as string,
    phone: row.phone as string,
    email: row.email,
    city: row.city,
    status: row.status,
    approvedCreditLimit: toPaisa(row.approved_credit_limit),
    outstanding: toPaisa(row.outstanding_amount),
    depositHeld: toPaisa(row.deposit_held_amount),
    totalPaid: toPaisa(row.total_paid_amount),
    activeBookingsCount: row.active_bookings_count ?? 0,
    totalBookingsCount: row.total_bookings_count ?? 0,
    // Passed through, null and all. This row is the one that does not lie about
    // a client who has never joined a tier.
    membershipLevel: row.membership_level,
    lastPickupAtAd: row.last_pickup_at,
  }
}

const DIRECTORY_COLUMNS =
  'id, client_code, name, phone, email, address_line, city, district, country, status, ' +
  'client_since, type_parent, pan_vat, approved_credit_limit, ' +
  'outstanding_amount, deposit_held_amount, total_paid_amount, ' +
  'active_bookings_count, total_bookings_count, last_pickup_at, ' +
  'contact_name, contact_designation, contact_phone, membership_level, ' +
  'kyc_docs_count, kyc_verified_count, is_blocked, deactivated_at, created_at'

/**
 * Directory row -> the `ClientRecord` every clients surface already consumes.
 *
 * This mapper is the honesty boundary of the whole wiring effort. Where the
 * database has the fact, it is used. Where it does not, the field is either
 * omitted (optional in `ClientRecord`) or given a value that is *true* — never
 * a plausible-looking default. A fabricated membership tier or KYC status on a
 * real client record is worse than an unwired screen, because someone will act
 * on it.
 *
 * **Two fields still fall short of that standard, and both are named where they
 * happen rather than left for a reader to discover:**
 *
 *  - `membership` — a client with no membership row gets
 *    `UNJOINED_MEMBERSHIP_PLACEHOLDER`, because `MembershipTier` is a closed
 *    union with no "none". Blocked on a ruling; the truthful readings are
 *    `ClientListItem.membershipLevel` and `ClientProfile.membershipKnown`.
 *  - `creditUsedPaisa` — 0, because the type demands a number and no source
 *    exists. Nothing reads it any more; the credit-limit check now reports
 *    itself unavailable instead of dividing by it.
 *
 * Neither is a value to build on. Both are `TODO(decision)`.
 */
export function toClientRecord(row: DirectoryRow): ClientRecord {
  const money = toPaisa(row.outstanding_amount)
  const deposit = toPaisa(row.deposit_held_amount)
  const paid = toPaisa(row.total_paid_amount)
  const limit = toPaisa(row.approved_credit_limit)

  return {
    id: row.client_code,
    name: row.name,
    clientType: (row.type_parent as ClientRecord['clientType']) ?? 'Unassigned',
    // ⚠ A `null` here means the client has NO membership row — see
    // `UNJOINED_MEMBERSHIP_PLACEHOLDER`. The placeholder is a type obligation,
    // not a fact about this client, and it is the one field in this mapper that
    // still renders a fabricated value. It stays only because removing it needs
    // a ruling on `MembershipTier`; the truthful reading is
    // `ClientListItem.membershipLevel` / `ClientProfile.membershipKnown`.
    membership: row.membership_level ?? UNJOINED_MEMBERSHIP_PLACEHOLDER,
    phone: row.phone,
    email: row.email ?? '',
    ...(row.pan_vat ? { pan: row.pan_vat } : {}),
    currentRentalsCount: row.active_bookings_count ?? 0,
    // The directory shows a COUNT of live bookings; the booking numbers
    // themselves need a per-client bookings query this view does not do. An
    // empty list is honest here — it is never rendered as "no bookings", the
    // count above is what the screen reads.
    activeBookings: [],
    // Money: `null` from the view means this session may not see money. The
    // ClientRecord type requires a Paisa, so a money-blind session gets 0 and
    // MUST NOT render it — every clients surface already gates money on
    // `useCanViewMoney`/`canViewMoneyField` before reading these.
    outstandingPaisa: money ?? (0 as Paisa),
    depositHeldPaisa: deposit ?? (0 as Paisa),
    creditLimitPaisa: limit ?? (0 as Paisa),
    // ⚠ TODO(decision): "credit used" has no column and no agreed formula.
    // Outstanding is the closest true figure, but calling it credit-used would
    // assert an equivalence nothing has ruled. Left at 0 rather than guessed.
    //
    // **This 0 is a type obligation, not a measurement.** `ClientRecord`
    // requires a `Paisa` and has no way to spell "unknown", so a placeholder is
    // unavoidable *here* — but nothing may read it as a figure, and the two
    // places that did have been changed:
    //
    //  - `modules/rentals/booking/clientHealth.ts` no longer divides by it. Its
    //    credit-limit blocker takes credit-used from
    //    `ClientHealthSignals.creditUsedPaisa` — which nothing supplies — and
    //    reports the check as `unavailable`, a CRITICAL. Before that change,
    //    the first screen to swap `CLIENTS_DATA` for `listClientRecords` would
    //    have made every utilisation `0 / limit = 0` and silently retired
    //    "Credit limit exceeded" for every client in the business.
    //  - `ClientQuickView` / `ClientHistoryDrawer` render the em-dash and the
    //    reason instead of "Rs 0 of Rs 500,000".
    //
    // Do not reconnect a reader to this field. The way to make credit-used
    // compute again is a ruled formula plus a real column.
    creditUsedPaisa: 0 as Paisa,
    lastRentalAd: row.last_pickup_at ? formatAd(new Date(row.last_pickup_at)) : '—',
    // Law 7: BS is rendered from the AD instant, never stored. '—' when there
    // has been no rental, rather than a fabricated date.
    lastRentalBs: row.last_pickup_at ? bsLabel(row.last_pickup_at) : '—',
    address: row.address_line ?? '',
    ...(row.city ? { city: row.city } : {}),
    ...(row.district ? { district: row.district } : {}),
    ...(row.country ? { country: row.country } : {}),
    contactPerson: {
      name: row.contact_name ?? '—',
      designation: row.contact_designation ?? '—',
      phone: row.contact_phone ?? '—',
    },
    kycStatus: kycStatusFrom(row.kyc_docs_count ?? 0, row.kyc_verified_count ?? 0),
    kycDocsCount: row.kyc_docs_count ?? 0,
    totalRentalsCount: row.total_bookings_count ?? 0,
    totalSpentPaisa: paid ?? (0 as Paisa),
    ...(row.client_since ? { clientSinceAd: row.client_since } : {}),
    // A block is a live row in `client_flags` with flag_type 'Blocked', NOT a
    // client status — `clients.status` is Active | Deactivated and 0001:832
    // says so outright ("Blocked is NOT a member of this enum, it is a flag on
    // client_flags"). Migration 0054 does that join inside the view and
    // publishes the result as `is_blocked`; this reads it.
    //
    // Spread rather than assigned because `isBlocked` is optional on
    // `ClientRecord` and `exactOptionalPropertyTypes` is on: an un-blocked
    // client has the key ABSENT, not present-and-false, which is the same
    // shape the seed records use.
    ...(row.is_blocked ? { isBlocked: true } : {}),
    // `blockReason` is deliberately still absent. `client_flags.reason` exists
    // (0005:236) but the view publishes only the boolean, and 0005's own
    // comment records that a mandatory reason is unruled. Inventing a sentence
    // for a block someone else recorded would be worse than the em dash the
    // screens already render.
  }
}

/**
 * ⚠ **BLOCKED — this is not a tier any client holds.**
 *
 * `client_directory_v` builds `membership_level` from `mem.level` over a LEFT
 * JOIN (verified against the live view definition, 12 Aug 2026), so `null` is
 * reachable and means exactly one thing: **this client has no membership row**.
 * They have not joined anything.
 *
 * `MembershipTier` is a closed union of five real, purchasable tiers and cannot
 * spell that state, so `toClientRecord` — whose `membership` field is required
 * and non-nullable — has to put *something* there. It puts this, and every
 * screen then renders "Academy" as a per-account badge on a client who is not
 * an Academy member. That is a fabricated fact on a real record.
 *
 * **TODO(decision) — `MembershipTier` needs a 'None' member.** It is a product
 * ruling, not a refactor, which is why it is not made here: adding the member
 * forces answers to "what does the tier pill say?" and "what colour is it?",
 * and `TIER_TONE`'s own comment already records that Foundation §4.2 assigns no
 * hue to any tier yet. When it is ruled, the change is small and mechanical —
 * add `'None'` to `MembershipTier` and a key to `TIER_TONE` in
 * `src/data/clients.ts` (NOT to `MEMBERSHIP_TIERS`, which is the list of real
 * tiers a client can be given), then return it from here instead of this
 * constant and delete the constant.
 *
 * Until then the absence is carried honestly on the two shapes this module
 * owns — `ClientListItem.membershipLevel` (`MembershipTier | null`) and
 * `ClientProfile.membershipKnown` — so a screen that needs the truth can read
 * it without believing the badge. Exported so that anything comparing against
 * it does so by name and a search for the fabrication finds every site.
 */
export const UNJOINED_MEMBERSHIP_PLACEHOLDER: MembershipTier = 'Academy'

/**
 * Derived, not stored. `client_document_status` only has Pending | Verified, so
 * three of the app's four KYC states are reachable and **'Rejected' is not** —
 * see migration 0053's header. Returning 'Pending Review' for a rejected client
 * would report a materially different fact, so rejection is simply never
 * claimed.
 */
function kycStatusFrom(total: number, verified: number): ClientRecord['kycStatus'] {
  if (total === 0) return 'Not Submitted'
  if (verified > 0) return 'Verified'
  return 'Pending Review'
}

/**
 * BS label for an AD instant, falling back to the **English date** outside
 * `lib/bs.ts`'s vouched range. It used to return `'—'`, which read as "no date"
 * for every client row once the clock left Shrawan 2083 — the date was known
 * throughout. `formatBsOrAd` owns that fallback for the whole app.
 */
function bsLabel(iso: string): string {
  return formatBsOrAd(new Date(iso))
}

export interface ListClientsOptions {
  /** Case-insensitive match on name, client code or phone. */
  search?: string
  limit?: number
}

/**
 * Active clients, newest first. Law 3 — deactivated clients are never deleted,
 * so they are filtered here rather than removed from the table.
 */
export async function listClients(opts: ListClientsOptions = {}): Promise<ClientListItem[]> {
  let q = supabase
    .from('client_directory_v')
    .select(DIRECTORY_COLUMNS)
    .is('deactivated_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.search?.trim()) {
    const term = opts.search.trim()
    // Postgrest `or` takes a comma-joined filter list; commas inside the term
    // itself would split it into bogus filters, so they are stripped.
    const safe = term.replace(/[,()]/g, ' ')
    q = q.or(`name.ilike.%${safe}%,client_code.ilike.%${safe}%,phone.ilike.%${safe}%`)
  }

  const { data, error } = await q
  if (error) throw new Error(`listClients failed: ${error.message}`)
  return (data ?? []).map((r) => toListItem(r as unknown as DirectoryRow))
}

/**
 * The same directory query, mapped to the `ClientRecord` shape the existing
 * clients screens already consume. Separate from `listClients` on purpose:
 * `ClientListItem` is the honest narrow row (money stays `Paisa | null`),
 * while `ClientRecord` is the app's wider legacy shape that cannot express
 * "money withheld" — see `toClientRecord` for exactly where that lossiness is
 * and why every caller must still gate money on the role.
 */
export async function listClientRecords(opts: ListClientsOptions = {}): Promise<ClientRecord[]> {
  let q = supabase
    .from('client_directory_v')
    .select(DIRECTORY_COLUMNS)
    .is('deactivated_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500)

  if (opts.search?.trim()) {
    const safe = opts.search.trim().replace(/[,()]/g, ' ')
    q = q.or(`name.ilike.%${safe}%,client_code.ilike.%${safe}%,phone.ilike.%${safe}%`)
  }

  const { data, error } = await q
  if (error) throw new Error(`listClientRecords failed: ${error.message}`)
  return (data ?? []).map((r) => toClientRecord(r as unknown as DirectoryRow))
}

export async function getClient(id: string): Promise<ClientListItem | null> {
  const { data, error } = await supabase
    .from('client_directory_v')
    .select(DIRECTORY_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`getClient failed: ${error.message}`)
  return data ? toListItem(data as unknown as DirectoryRow) : null
}

/**
 * One client, addressed the way the app links to it.
 *
 * Every `/clients/:id` link in the app is built from `ClientRecord.id`, which
 * `toClientRecord` sets to `client_code` — so the detail page is handed a CODE
 * ('CL-0042'), never the uuid. `getClient` above takes the uuid and is therefore
 * unusable from that route.
 *
 * The uuid is returned ALONGSIDE the record rather than folded into it, because
 * every per-client query in the app keys on it: `invoicesForClient`,
 * `paymentsForClient` (`queries/finance.ts`) and the `bookings.client_id` FK all
 * take `clients.id`, and each of their doc comments warns that passing the code
 * returns zero rows silently rather than erroring. Losing the uuid at this
 * boundary is what would make those calls quietly wrong.
 */
export interface ClientProfile {
  /** `clients.id` — the uuid every other table's `client_id` FK points at. */
  id: string
  record: ClientRecord
  /** Law 3 — set on a closed account, which is retained and readable. AD/UTC. */
  deactivatedAtAd: string | null
  /**
   * `false` when the client has no membership row at all.
   *
   * `record.membership` is NOT trustworthy on its own: it is required and
   * non-nullable, so a client who has never joined still carries
   * `UNJOINED_MEMBERSHIP_PLACEHOLDER` there. Read this before rendering the
   * tier as a badge, quoting a tier discount, or claiming a credit default —
   * `false` means the answer is "none", not "Academy".
   */
  membershipKnown: boolean
}

export async function getClientRecordByCode(clientCode: string): Promise<ClientProfile | null> {
  // Deliberately NOT filtered on `deactivated_at`: a link to a closed account
  // must still open it (Law 3 — retained and marked). The flag is returned so
  // the screen can mark it.
  const { data, error } = await supabase
    .from('client_directory_v')
    .select(DIRECTORY_COLUMNS)
    .eq('client_code', clientCode)
    .maybeSingle()

  if (error) throw new Error(`getClientRecordByCode failed: ${error.message}`)
  if (!data) return null

  const row = data as unknown as DirectoryRow
  return {
    id: row.id,
    record: toClientRecord(row),
    deactivatedAtAd: row.deactivated_at,
    membershipKnown: row.membership_level !== null,
  }
}

/* ── duplicate detection against the directory ──────────────────────────────
 *
 * Three screens ask "does this client already exist?": Add Client (the phone
 * the operator is typing), Import Center (every phone/email in an uploaded
 * CSV) and the Duplicate & Merge Center (the whole directory). All three used
 * to ask `CLIENTS_DATA` — the 26-row seed array — so a client that existed in
 * the database produced no warning, and the banner could name a client that
 * did not exist (docs/pages 05 §7.7, 42 §7.3, 43 §7.6). These functions are
 * the Law 2 replacement: the matching is a server-side filter on
 * `client_directory_v`, never a full-table download matched in the browser.
 *
 * Both use `.or(…ilike…)` rather than `.ilike()` deliberately: the mock
 * PostgREST engine (`lib/mock/engine.ts`) implements ilike ONLY inside
 * `.or()` clauses — a bare `.ilike()` builder method does not exist there and
 * would crash mock mode outright.
 */

/**
 * Directory clients whose phone ends with the digits typed so far — the Add
 * Client duplicate warning. Matches on the last 9 digits (the same tail the
 * old seed check compared), so a `+977`-prefixed stored phone still matches a
 * bare local number as it is typed. Fewer than 7 digits is not enough of a
 * phone to ask about; returns `[]` without a round trip.
 *
 * The tail is digits-only by construction, so it cannot break the `.or()`
 * filter syntax. Deactivated clients are excluded (Law 3 — they are retained,
 * but a closed account is not a duplicate-warning candidate; the phone unique
 * constraint is the backstop either way).
 */
export async function findClientsByPhoneTail(phoneInput: string, limit = 3): Promise<ClientRecord[]> {
  const digits = phoneInput.replace(/\D/g, '')
  if (digits.length < 7) return []
  const tail = digits.slice(-9)

  const { data, error } = await supabase
    .from('client_directory_v')
    .select(DIRECTORY_COLUMNS)
    .is('deactivated_at', null)
    .or(`phone.ilike.%${tail}`)
    .limit(limit)

  if (error) throw new Error(`findClientsByPhoneTail failed: ${error.message}`)
  return (data ?? []).map((r) => toClientRecord(r as unknown as DirectoryRow))
}

export interface ClientMatchKeys {
  phones?: readonly string[]
  emails?: readonly string[]
}

/**
 * Directory clients matching ANY of the given phones (last-10-digit tail) or
 * emails (exact, case-insensitive) — the Import Center's duplicate corpus.
 *
 * This is a *prefilter*, not the verdict: it returns candidate `ClientRecord`s
 * and the caller's exact matcher (`buildImportRow`, which compares
 * `normalizedPhone` / lowercased email) decides row by row. Over-matching is
 * therefore harmless and under-matching is the only failure that matters,
 * which is why:
 *
 *  - phone tails are digits-only suffix matches (`phone.ilike.%<tail>`) —
 *    valid against the canonical `+977…` storage format the
 *    `clients_phone_format` CHECK enforces;
 *  - emails that contain characters able to break the PostgREST `.or()`
 *    filter syntax (commas, parens, wildcards, whitespace) are skipped rather
 *    than escaped-and-hoped; a skipped email only means that row's duplicate
 *    flag falls back to its phone match.
 *
 * Clauses are chunked so a large CSV cannot build a URL longer than the
 * server accepts; results are merged and de-duplicated on `id`.
 */
export async function findClientMatches(keys: ClientMatchKeys): Promise<ClientRecord[]> {
  const clauses: string[] = []

  const phoneTails = new Set<string>()
  for (const p of keys.phones ?? []) {
    const digits = p.replace(/\D/g, '')
    if (digits.length >= 7) phoneTails.add(digits.slice(-10))
  }
  phoneTails.forEach((t) => clauses.push(`phone.ilike.%${t}`))

  const emailKeys = new Set<string>()
  for (const e of keys.emails ?? []) {
    const cleaned = e.trim().toLowerCase()
    // Conservative allow-list: anything outside it could split or wildcard the
    // or() filter. `_` remains a single-char ilike wildcard — acceptable,
    // because it can only widen the candidate set the exact matcher then culls.
    if (cleaned && /^[a-z0-9._+@-]+$/.test(cleaned)) emailKeys.add(cleaned)
  }
  emailKeys.forEach((e) => clauses.push(`email.ilike.${e}`))

  if (clauses.length === 0) return []

  const CHUNK = 30
  const byId = new Map<string, DirectoryRow>()
  for (let i = 0; i < clauses.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('client_directory_v')
      .select(DIRECTORY_COLUMNS)
      .is('deactivated_at', null)
      .or(clauses.slice(i, i + CHUNK).join(','))
      .limit(500)

    if (error) throw new Error(`findClientMatches failed: ${error.message}`)
    for (const row of (data ?? []) as unknown as DirectoryRow[]) byId.set(row.id, row)
  }

  return Array.from(byId.values()).map(toClientRecord)
}

/**
 * The referrer dropdown on Generate Referral Code — every active client,
 * ordered by name server-side (no client-side `.sort()`, per the wiring
 * rules). Narrow on purpose: the screen needs a name to suggest a code from
 * and the code every `/clients/:id` link is built from, nothing else.
 *
 * `isBlocked` is returned so the screen can SAY a client is blocked rather
 * than either hiding them (an unruled product decision — nothing has ruled
 * that a blocked client may not refer) or listing them indistinguishably
 * (the failure docs/pages/44 §7.5 flags).
 */
export interface ReferrerOption {
  /** `client_code` — the id every `/clients/:id` link uses. */
  clientCode: string
  name: string
  isBlocked: boolean
}

export async function listReferrerOptions(): Promise<ReferrerOption[]> {
  const { data, error } = await supabase
    .from('client_directory_v')
    .select('id, client_code, name, is_blocked')
    .is('deactivated_at', null)
    .order('name', { ascending: true })
    .limit(1000)

  if (error) throw new Error(`listReferrerOptions failed: ${error.message}`)

  return ((data ?? []) as unknown as Array<Pick<DirectoryRow, 'client_code' | 'name' | 'is_blocked'>>).map((r) => ({
    clientCode: r.client_code,
    name: r.name,
    isBlocked: r.is_blocked === true,
  }))
}

/**
 * The membership plans, from `membership_plans_v`.
 *
 * 0005_clients.sql states the rule this exists to satisfy, in the table's own
 * comment: **"no plan value may be hardcoded in application code — every read
 * comes from this table."** The Credit tab used to carry a five-row
 * `CREDIT_POLICY` constant that did exactly that.
 *
 * Money is masked column-wise, not row-wise: `membership_plans_v` (0048:522)
 * NULLs `annual_fee`, `individual_discount_pct`, `bundle_discount_pct` and
 * `default_credit_limit` for a money-blind session and returns the row anyway,
 * so `null` here means WITHHELD, never zero. The view is also `where
 * auth_is_staff()`, so a Client session gets no rows at all.
 */
export interface MembershipPlanRow {
  level: MembershipTier
  /** `membership_label` — the plan's own words. Levels are distinguished by label, never hue (0005). */
  label: string
  /** `default_credit_limit`. `null` = this session may not see money. */
  defaultCreditLimit: Paisa | null
  /** A PERCENTAGE, not an amount — stays numeric (lib/money §2.3). `null` for Elite ("Negotiated") AND for a money-blind session; the two are indistinguishable here by design. */
  individualDiscountPct: number | null
  displayOrder: number
}

interface MembershipPlanViewRow {
  level: MembershipTier | null
  label: string | null
  default_credit_limit: number | null
  individual_discount_pct: number | null
  display_order: number | null
  status: string | null
}

export async function listMembershipPlans(): Promise<MembershipPlanRow[]> {
  const { data, error } = await supabase
    .from('membership_plans_v')
    .select('level, label, default_credit_limit, individual_discount_pct, display_order, status')
    // Retire is terminal and a plan with historic members can never be deleted
    // (0005), so retired plans must be excluded here rather than shown as live
    // policy.
    .eq('status', 'Active')
    .order('display_order', { ascending: true })

  if (error) throw new Error(`listMembershipPlans failed: ${error.message}`)

  return (data ?? [])
    .map((r) => r as unknown as MembershipPlanViewRow)
    // `level` and `label` are `not null` on the base table; the generated view
    // type widens every column to nullable. A row that somehow arrives without
    // a level cannot be labelled, so it is dropped rather than rendered as an
    // unnamed tier.
    .filter((r): r is MembershipPlanViewRow & { level: MembershipTier } => r.level !== null)
    .map((r) => ({
      level: r.level,
      label: r.label ?? r.level,
      defaultCreditLimit: toPaisa(r.default_credit_limit),
      individualDiscountPct: r.individual_discount_pct,
      displayOrder: r.display_order ?? 0,
    }))
}

export interface NewClientInput {
  name: string
  phone: string
  email?: string | null
  city?: string | null
  addressLine?: string | null
}

/**
 * Create a client.
 *
 * `client_code` is NOT generated here — `next_document_number('client')`
 * (0007) is the one allocator, and duplicating its sequence logic in the
 * browser is exactly the drift Law 1 forbids. It is passed as a Postgres
 * expression via an RPC-free insert by letting the database default fill it
 * where a default exists; where it does not, the caller supplies one and the
 * unique constraint is the backstop.
 *
 * Law 8: `client_uuid` is generated once, at the point the user acts, so a
 * replayed submit conflicts instead of creating a duplicate.
 */
export async function createClient(input: NewClientInput, clientUuid?: string): Promise<ClientListItem> {
  const payload = {
    client_uuid: clientUuid ?? newClientUuid(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    city: input.city?.trim() || null,
    address_line: input.addressLine?.trim() || null,
  } as unknown as ClientInsert

  const { data, error } = await supabase
    .from('clients')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    // 23505 on client_uuid means this exact submit already landed — Law 8's
    // whole point. Return the existing row rather than surfacing an error the
    // user cannot act on.
    if (error.code === '23505' && error.message.includes('client_uuid')) {
      // Resolve the id the first submit created, then re-read through the one
      // directory query so a replayed create and a fresh create return the
      // identical shape (Law 2 — one query per entity, not two that can drift).
      const { data: existing } = await supabase
        .from('clients_v')
        .select('id')
        .eq('client_uuid', payload.client_uuid as string)
        .maybeSingle()
      const priorId = (existing as { id: string } | null)?.id
      if (priorId) {
        const prior = await getClient(priorId)
        if (prior) return prior
      }
    }
    throw new Error(`createClient failed: ${error.message}`)
  }

  const created = await getClient((data as { id: string }).id)
  if (!created) throw new Error('createClient: row vanished immediately after insert')
  return created
}
