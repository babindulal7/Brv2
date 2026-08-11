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
import { toBs, formatBs, formatAd } from '../bs'
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
    lastPickupAtAd: row.last_pickup_at,
  }
}

const DIRECTORY_COLUMNS =
  'id, client_code, name, phone, email, address_line, city, district, country, status, ' +
  'client_since, type_parent, pan_vat, approved_credit_limit, ' +
  'outstanding_amount, deposit_held_amount, total_paid_amount, ' +
  'active_bookings_count, total_bookings_count, last_pickup_at, ' +
  'contact_name, contact_designation, contact_phone, membership_level, ' +
  'kyc_docs_count, kyc_verified_count, deactivated_at, created_at'

/**
 * Directory row -> the `ClientRecord` every clients surface already consumes.
 *
 * This mapper is the honesty boundary of the whole wiring effort. Where the
 * database has the fact, it is used. Where it does not, the field is either
 * omitted (optional in `ClientRecord`) or given a value that is *true* — never
 * a plausible-looking default. A fabricated membership tier or KYC status on a
 * real client record is worse than an unwired screen, because someone will act
 * on it.
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
    membership: row.membership_level ?? DEFAULT_MEMBERSHIP,
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
    // TODO(decision): "credit used" has no column and no agreed formula.
    // Outstanding is the closest true figure, but calling it credit-used would
    // assert an equivalence nothing has ruled. Left at 0 rather than guessed.
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
    // `isBlocked` is deliberately NOT set here. There is no 'Blocked' client
    // status — `clients.status` is Active | Deactivated (0001:832 says so
    // outright: "Blocked is NOT a member of this enum, it is a flag on
    // client_flags"). A block is a row in `client_flags` with the 'Blocked'
    // flag value (0038 restricts who may set it), which this view does not
    // join yet. Reporting every client as un-blocked would be a false negative
    // on a credit-control signal, so the field is left absent instead.
    //
    // Consequence until the view carries it: a blacklisted client renders in
    // the directory as an ordinary one, and the "Blocked Balance" KPI on
    // Clients.tsx counts nothing.
    //
    // TODO(persistence): migration 0054 adds `is_blocked` to
    // `client_directory_v`. The follow-up here is two lines — add `is_blocked`
    // to DIRECTORY_COLUMNS and to DirectoryRow, then spread
    // `...(row.is_blocked ? { isBlocked: true } : {})` back in — and is
    // deliberately NOT applied ahead of that migration: a `select` naming a
    // column the deployed view lacks 400s the whole request and takes the
    // directory down.
  }
}

/**
 * A client with no membership row genuinely has no tier. `MembershipTier` has
 * no "none" member, so the lowest real tier is used and flagged here rather
 * than silently promoting anyone to a paid tier.
 * TODO(decision): whether `MembershipTier` needs a 'None' member for clients
 * who have never joined — today the type cannot express that state.
 */
const DEFAULT_MEMBERSHIP: MembershipTier = 'Academy'

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

/** BS label for an AD instant, or '—' when the date falls outside lib/bs.ts's vouched range. */
function bsLabel(iso: string): string {
  const bs = toBs(new Date(iso))
  return bs ? formatBs(bs) : '—'
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
