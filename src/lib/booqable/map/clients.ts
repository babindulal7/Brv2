/**
 * Booqable client resource → local `clients` mapper.
 *
 * ## Law 17 — "client" only
 *
 * Per PLAN.md §0 law 17, Law 17's excepted term is allowed as an identifier
 * in exactly one file: `../types.ts` (it mirrors Booqable's own wire
 * vocabulary there — see that file's own header for the literal spelling).
 * This file maps Booqable's client-side resource, but every identifier in
 * THIS file — types, functions, variables, comments included — says
 * "client". The excepted term would be a build defect here. The one
 * exemption is a Booqable documentation URL: an external web address is
 * not an identifier and cannot be respelled without breaking the link.
 *
 * ## Ownership (spec §5.1 / §5.2) — what this file may and may not write
 *
 * §5.1: Booqable's client resource → `clients`, **"OS MAY write (create plus contact
 * fields only)"**. That push direction (OS → Booqable) is explicitly out of
 * scope for this file — this is a PULL mapper only, same shape as every
 * other file in this directory (`products.ts`, `stock.ts`). Nothing here
 * calls `booqableWrite`/`booqableDelete` from `../client.ts`, and nothing
 * here produces a `sync_outbox` row. If/when the push direction is built, it
 * belongs in a separate function (or a separate file), not folded into
 * `mapClients` below.
 *
 * §5.2 names three things on the `clients` domain that are **OS-sole-master
 * and must never be written from an inbound Booqable payload, even if
 * Booqable happens to send something that looks similar**:
 *   1. Membership tier (`membership_plans` / `client_memberships`) — this
 *      file never inserts/updates either table, and never reads a Booqable
 *      field into anything resembling a tier.
 *   2. Credit terms — `clients.approved_credit_limit` and
 *      `clients.payment_terms` are BOTH gated, per `0005_clients.sql`'s own
 *      trigger note, to be written ONLY by an *Approved*
 *      `client_commercial_overrides` row — "No direct UPDATE path, for any
 *      role including Owner." `LocalClientFields` below has no
 *      `approved_credit_limit` / `payment_terms` key at all — not merely
 *      "not populated from Booqable," structurally absent, so there is no
 *      field for a careless future edit to wire up by accident.
 *   3. Standing per-client discounts — there is no such column on `clients`
 *      in `0005_clients.sql` at all (discount stacking/approval lives on the
 *      booking/discount side, not the client record) — nothing to
 *      accidentally overwrite here, noted so a future reader doesn't go
 *      looking for one.
 *
 * Everything else this file writes is on the Booqable-is-master side of
 * §5.1 — contact fields, address, and (best-effort — see the tax section
 * below) tax identity. "Merge fields, tax profile, and addresses come from
 * Booqable and sync in" (this file's brief) is read here as: the client's
 * contact/identity fields (name, phone, email), its tax number, and its
 * address block are the syncable surface — not `clients.merged_into_client_id`
 * or any part of `client_merges`, which is a wholly OS-side, human-gated
 * irreversible action (`0005_clients.sql` §`client_merges`) with no Booqable
 * equivalent at all and is never touched by this file.
 *
 * ## Table shape — verified against the migration, not assumed
 *
 * Read `supabase/migrations/0005_clients.sql` (the `clients` table DDL) and
 * `supabase/migrations/0038_client_money_masking_corrections.sql` (its full
 * header comment) directly before writing this file, per this file's own
 * brief. The header of `0038` is what actually pins down which two columns
 * are the money-sensitive ones this mapper must never touch:
 * `approved_credit_limit` and `payment_terms` — masked server-side by
 * `clients_v` behind `auth_can_view_money()` for Warehouse/Technician/
 * Driver/Client roles (Law 6), and gated at the write side by the
 * `client_commercial_overrides` approval flow (see point 2 above). Nothing
 * in `0038` changes this file's job — it is a read-side RLS/view fix, not a
 * schema change — but its header is the clearest single statement in the
 * repo of exactly why those two columns are radioactive for an inbound
 * mapper to touch, so it is cited here rather than re-derived.
 *
 * `src/types/database.ts` is NOT used as the source of row shapes here, for
 * the same reason `products.ts`/`stock.ts` don't use it — it has its own,
 * separately documented drift from the live migrations (see those two
 * files' headers, and PROGRESS.md's "database.ts schema drift" entries).
 * Row shapes below are hand-typed from `0005_clients.sql`'s `create table
 * clients` and its enum types in `0001_enums.sql`.
 *
 * ## Money
 *
 * This file writes NO money field. `clients.approved_credit_limit` is the
 * only monetary column on `clients` and it is structurally excluded (see
 * above). Nothing here imports `lib/money.ts` — there is nothing here that
 * needs `Paisa`.
 *
 * ## Law 3 — archive, never delete
 *
 * `clients.status` (`client_status`: `'Active' | 'Deactivated'`) is the
 * table's terminal-action column; there is no `deleted_at`. The archived
 * flag (`archived: true`) on a Booqable client record maps to `status:
 * 'Deactivated'`,
 * `deactivated_at: archived_at`. Per the same reasoning `stock.ts` already
 * documents for `product_units` (see that file's header, "Booqable
 * un-archiving a previously-retired unit … is deliberately NOT handled"):
 * this mapper only ever moves a client FORWARD into Deactivated on an
 * archive; it never clears `deactivated_at` because Booqable flipped
 * `archived` back to `false`. Resurrecting a client record automatically
 * is a strictly worse default than requiring a human (via the OS's own
 * Reactivate action, out of scope here) to do it deliberately.
 * `deactivated_by` stays `null` (nullable column, no sync-actor convention
 * exists anywhere in this codebase — see `stock.ts`'s identical note on
 * `retired_by`, this column just isn't `NOT NULL` here so there is nothing
 * to skip over).
 *
 * ## Duplicate phone (spec §7 conflict policy)
 *
 * `clients.phone` is `NOT NULL UNIQUE` with a hard format CHECK
 * (`^\+977(97|98)[0-9]{8}$`, `0005_clients.sql` line ~91) and is explicitly
 * "the unique identifier, not email" per that table's own column comment.
 * A Booqable client record whose phone does not survive normalisation into that
 * exact shape, or collides with a phone already claimed locally by a
 * DIFFERENT external id, cannot be safely written — logged to
 * `sync_conflicts` and skipped, never silently dropped and never force-fit
 * with an invented digit. See `resolveClientPhone` below for exactly how
 * far normalisation goes and where it deliberately stops.
 *
 * ## Contact/address fields — they are PROPERTIES, read via SIDELOAD
 *
 * The verification pass (types.ts §3/§3b;
 * https://developers.booqable.com/#customers, #properties) settled that the
 * Booqable client resource has NO phone / company-name / address / tax
 * columns at all — contact data lives in separate Property resources
 * (property_type: address | date_field | email | phone | select |
 * text_area | text_field), surfaced on the record as the readonly
 * `properties` hash keyed by ACCOUNT-CONFIGURED property identifiers.
 *
 * The hash alone is not safe to import from. Its keys are the properties'
 * `identifier` values — free text an account owner can rename ("Mobile",
 * "contact_no", "phone_1") — so guessing `properties['phone']` means every
 * client on a non-default account resolves NO phone, fails
 * `clients.phone`'s NOT NULL + `+977` CHECK, and becomes a conflict row.
 * With clients gating orders, that is a ~0%-success import.
 *
 * So this mapper reads SIDELOADED Property RESOURCES instead — docs,
 * verbatim: *"When you need more details than provided by the `properties`
 * attribute, use `?include=properties` to sideload properties instead of
 * querying them separately."* Each sideloaded entry carries
 * `property_type`, which is a CLOSED, documented enum, so the phone is
 * "the property whose property_type is 'phone'" — no identifier guessing.
 * `sync.ts` fetches `?include=properties`, runs the `included` array's
 * `properties` entries through `groupClientProperties` below, and passes
 * the result in as `ClientSyncContext.clientProperties`. This file stays
 * pure — it performs no I/O and never resolves a sideload itself.
 *
 * Resolution order, per field (see `resolveClientPhone` /
 * `resolveClientAddress`), most trustworthy first:
 *   1. typed match — a sideloaded property with the right `property_type`;
 *   2. identifier match — a sideloaded property whose `identifier`/`name`
 *      is one of the stock keys, used ONLY when no typed property exists
 *      (an account can define e.g. a phone as a `text_field`);
 *   3. the readonly `properties` hash under the same stock keys — the
 *      last-resort path, and what keeps this mapper working unchanged if
 *      it is ever called with no sideload at all (empty
 *      `clientProperties`), rather than failing every record.
 *
 * PUSH is deliberately untouched by this pass. TODO(decision): writing a
 * phone/address back means the owner's writeonly `properties_attributes`
 * array (docs, "Manage properties through their owner") on the client
 * PATCH body, not a POST to /properties — an array of hashes, either
 * `{ identifier: 'phone', value: '+977…' }` to hit an existing default
 * property, or `{ name: 'Phone', property_type: 'phone', value: '…' }` for
 * a one-off. Note its `{ id, _destroy: true }` entry is a real delete on
 * Booqable's side and is barred by Law 3 regardless. Which of the two
 * shapes this business's account needs, and whether the OS may create
 * one-off properties at all, is unanswered — that belongs to the push
 * path in `sync.ts`, not here.
 *
 * ## Company vs individual — CONFIRMED: `legal_type`
 *
 * The person-vs-company field is `legal_type: 'person' | 'commercial'`
 * (docs, "Either person or commercial") — the scaffold's open TODO on this
 * is resolved. `mapClientTypeParent` now maps `commercial` →
 * `'Organisation'` (subtype `'Other'` — Booqable exposes no subtype
 * vocabulary matching this schema's closed `client_organisation_subtype`
 * enum) and `person` → `'Individual'`.
 *
 * ## Tax identity — NO documented source; `client_tax_profiles` NOT written
 *
 * CONFIRMED 10 Aug 2026: the guessed `tax_number` column does not exist on
 * the wire (types.ts §3) — the resource's only tax-adjacent fields are
 * `tax_region_id` and `stripe_id`, neither of which is a PAN/VAT number.
 * `clients.pan_vat` (9-digit CHECK, `0005_clients.sql` line ~93) therefore
 * has no *documented* Booqable source. If the business records PAN/VAT as a
 * custom property, it is a `text_field` — and `text_field` is the catch-all
 * type, so unlike phone/address there is NO type-based match that can find
 * it; only its account-configured `identifier` can. TODO(decision): which
 * identifier that is (`pan`, `vat`, `pan_vat`, `PAN/VAT No.`, …) is a
 * question for the business, not something this file may guess. The plumbing
 * is parameterised instead: set `ClientSyncContext.panVatPropertyIdentifier`
 * once the answer is known and `resolveClientPanVat` will read it; leave it
 * undefined (the current state, and what `sync.ts` passes) and this mapper
 * writes no `pan_vat` at all, exactly as before. A resolved value that fails
 * the 9-digit CHECK is logged to `sync_conflicts` and OMITTED — never
 * written (it would abort the whole insert) and never reshaped to fit.
 * Unlike phone, an unresolvable PAN does not cost us the client: the column
 * is nullable and "the booking Confirm gate enforces it" (that column's own
 * comment in `0005_clients.sql`).
 *
 * ## Company name / business registration — no second column to write
 *
 * There is no `company_name` column: `0005_clients.sql` says "There is no
 * separate companies table," and `clients.name` is "One column; the label
 * swaps by type." Booqable agrees — its `name` is "Person or Company name"
 * and `legal_type` says which. So the company case needs no extra
 * extraction: `name` → `name`, `legal_type` → `type_parent` (below), done.
 * `clients.business_registration` and `clients.website` (both
 * Organisation-only, per `clients_org_fields_null_for_individual`) have no
 * documented Booqable source and no property TYPE that could identify one —
 * same shape of gap as `pan_vat`, and left unwritten for the same reason
 * rather than given a knob nobody has asked for.
 *
 * Separately, `client_tax_profiles.profile_type` (a closed enum covering
 * VAT-registered, non-VAT, tax-exempt, government, NGO, and corporate
 * accounts — see `0001_enums.sql` for the exact type name and member
 * spellings) has NO corresponding field anywhere on the client attributes
 * Booqable sends back to classify it from. TODO(decision): inferring a tax
 * profile classification from `tax_number`'s mere presence
 * (e.g. "has a tax number ⇒ VAT Registered") would be inventing a business
 * rule this file's brief never states — per CLAUDE.md's "never invent a
 * product decision," this file does NOT write `client_tax_profiles` at all.
 * `pull()`'s `conflicts` array carries nothing for this gap (it is not a
 * per-record conflict, it is a structural "this table isn't populated by
 * this mapper" fact) — noted here instead so a future reader doesn't go
 * looking for a `mapTaxProfiles` export that was never written.
 *
 * ## Address mapping
 *
 * CONFIRMED 10 Aug 2026: addresses are address-TYPE Property resources
 * (docs #properties — address properties carry first_name/last_name/
 * address1/address2/city/region/zipcode/country/country_id/province_id/
 * latitude/longitude), not client columns. Resolved by `property_type ===
 * 'address'` off the sideload (see `resolveClientAddress`), then mapped:
 *   address1 (+ address2, comma-joined when both present) → address_line
 *   city                                                  → city
 *   region                                                → district
 *   zipcode                                                → postal_code
 *   country (falls back to the column's own 'Nepal' default when Booqable
 *            supplied none, matching `0005_clients.sql`'s
 *            `default 'Nepal'`) → country
 * `clients.billing_address` has no Booqable source field at all and is
 * deliberately excluded from `LocalClientFields` — it is never touched by
 * this mapper in either direction, so an OS-side billing address is never
 * clobbered by a sync pass that has nothing real to put there. Its
 * corollary at the property level: an address property whose identifier is
 * `billing_address` is SKIPPED as a candidate for the physical-address
 * columns (docs #properties name `delivery_address` / `billing_address` as
 * the two conventional address identifiers) — a billing address is a
 * different fact from where the client is, and the column that would hold
 * it is out of scope here. `delivery_address` is accepted, ranked below a
 * plainly-identified `address`.
 * TODO(decision) — `region` → `district` is the closest available field by
 * position, not a confirmed naming equivalence; flagged rather than
 * asserted as fact.
 *
 * ## client_code — minted, never taken from Booqable
 *
 * `clients.client_code` is `NOT NULL UNIQUE`, format-locked to
 * `^CL-[0-9]{4}-[0-9]{4}$` (AD year only) — the retired form; the app now
 * issues `C-1` per the 12 Aug ruling and the CHECK has not been migrated. It is normally minted via
 * `next_document_number('CL')` (`number_sequences` — `0007_admin_security.sql`
 * confirms a `CL` prefix is registered). Exactly the same shape of gap
 * `products.ts` already documents for `asset_code`/`EQ######`: this file
 * never invents a code and never writes a Booqable id into this column.
 * `sync.ts` is expected to mint one per NEW (not-yet-synced) client via
 * `next_document_number('CL')` and supply it through
 * `ClientSyncContext.mintedClientCodes`, exactly mirroring
 * `ProductCatalogueContext.mintedAssetCodes` in `products.ts`. A new client
 * with no minted code available is logged as a conflict and skipped, never
 * inserted with a guessed code.
 */

import { BOOQABLE_CLIENT_ENTITY, BOOQABLE_PROPERTY_ENTITY } from '../types'
import type {
  BooqableClientAttributes,
  BooqableClientEntity,
  BooqableId,
  BooqablePropertyAttributes,
  BooqablePropertyEntity,
} from '../types'
import type { BooqableFlatResource } from '../client'

/* ── enum mirrors — read straight off 0001_enums.sql, not re-derived ────── */

export type ClientTypeParent = 'Organisation' | 'Individual'

export type ClientOrganisationSubtype =
  | 'Production House'
  | 'Rental House'
  | 'College / Institution'
  | 'Corporate / Agency'
  | 'Government / NGO'
  | 'Broadcaster'
  | 'Other'

export type ClientStatus = 'Active' | 'Deactivated'

/* ── shared result / context shapes — same pattern as products.ts ───────── */

export interface LocalRowUpdate<TFields> {
  id: string
  fields: TFields
}

/**
 * Mirrors `sync_conflicts` (`0040_booqable_sync.sql`) minus DB-defaulted
 * columns, same shape as the sibling mapper files. `owner` is always
 * `'booqable'` here — every field this file ever writes is on the
 * Booqable-is-master side of §5.1; a conflict row only ever means "the
 * inbound value could not be safely applied," never a local-wins case.
 */
export interface SyncConflictInsert {
  entity: string
  local_id: string | null
  external_id: string | null
  field: string
  local_value: string | null
  external_value: string | null
  owner: 'booqable'
}

export interface PullResult<TInsert, TUpdate> {
  toInsert: TInsert[]
  toUpdate: LocalRowUpdate<TUpdate>[]
  conflicts: SyncConflictInsert[]
}

/**
 * Everything `sync.ts` must resolve/supply before calling `mapClients` —
 * see the file-header TODO(decision)s for why each of these can't be
 * computed in here without inventing an answer.
 */
export interface ClientSyncContext {
  /** external_id -> local `clients.id`, for rows already synced (from `external_refs`, entity-scoped by the caller). Present ⇒ update; absent ⇒ insert. */
  existingRefs: ReadonlyMap<BooqableId, string>
  /** `external_refs.payload_hash` for rows already synced, so a genuinely-unchanged record can be skipped (spec §7 rule 3) instead of writing a no-op update. */
  existingPayloadHashes: ReadonlyMap<BooqableId, string>
  /** Normalised phones already claimed locally by a DIFFERENT external_id — see the file-header duplicate-phone note. */
  knownPhones: ReadonlySet<string>
  /** external client id -> a freshly minted client code (`C-N`) from `next_document_number('CL')`, one entry per NEW (not-yet-synced) client in this batch. See file header. */
  mintedClientCodes: ReadonlyMap<BooqableId, string>
  /**
   * Sideloaded Property resources for this batch, keyed by the OWNING
   * client's Booqable id (`property.owner_id`) — the output of
   * `groupClientProperties` below, fed from the `included` array of
   * `GET /{clients}?include=properties`. This is where phone and address
   * actually come from; see the file header.
   *
   * REQUIRED, not optional, on purpose: an absent sideload is the exact
   * failure mode this field exists to prevent, and a silent `?? new Map()`
   * default would let a caller reintroduce it without noticing. A caller
   * that genuinely has no sideload passes an empty map and gets the
   * documented last-resort behaviour (the `properties` hash), knowingly.
   */
  clientProperties: ReadonlyMap<BooqableId, readonly ClientPropertyRecord[]>
  /**
   * TODO(decision) — the account-configured `identifier` of the property
   * holding PAN/VAT, if the business records one. Undefined (the current
   * state) ⇒ `pan_vat` is never written. See the file header, "Tax
   * identity"; a `text_field` cannot be found by type, only by this key.
   */
  panVatPropertyIdentifier?: string | undefined
}

/** Cheap, non-cryptographic stable hash for change detection only (spec §7 rule 3) — same FNV-1a-32-over-sorted-JSON approach as `products.ts`'s `computePayloadHash`, duplicated rather than imported so this file stays self-contained like its siblings. */
export function computeClientPayloadHash(value: unknown): string {
  const stable = JSON.stringify(sortKeysDeep(value))
  let hash = 0x811c9dc5
  for (let i = 0; i < stable.length; i++) {
    hash ^= stable.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/* ── phone — normalise just enough, never guess further ──────────────────
 * Required shape: `^\+977(97|98)[0-9]{8}$`. Booqable's raw phone string is
 * unconstrained free text. Normalisation deliberately stops at:
 *   1. strip whitespace/dashes/parens,
 *   2. if it already starts with '+977', leave the prefix as-is,
 *   3. if it starts with '977' (no '+'), add the '+',
 *   4. if it is a bare 10-digit number starting '97' or '98' (the exact
 *      domestic shape the CHECK expects minus the country code), prefix
 *      '+977'.
 * Anything else (a foreign number, a landline, a malformed string, an empty
 * string) is left AS-IS and validated against the real CHECK regex next —
 * if it still doesn't match, the record is routed to `conflicts`, never
 * forced through. This is normalisation of an already-Nepali-shaped number,
 * not a business rule about which numbers are acceptable — inventing a
 * country-code-guessing rule beyond this narrow, reversible case would be
 * exactly the kind of unstated product decision CLAUDE.md forbids.
 * ────────────────────────────────────────────────────────────────────── */
const NEPAL_PHONE_FORMAT = /^\+977(97|98)[0-9]{8}$/
const BARE_DOMESTIC_PHONE = /^(97|98)[0-9]{8}$/

export function normalizeClientPhone(raw: string | null): string | null {
  if (raw === null) return null
  const stripped = raw.replace(/[\s\-()]/g, '')
  if (stripped.length === 0) return null
  if (stripped.startsWith('+977')) return stripped
  if (stripped.startsWith('977')) return `+${stripped}`
  if (BARE_DOMESTIC_PHONE.test(stripped)) return `+977${stripped}`
  return stripped
}

/* ═══════════════════════════════════════════════════════════════════════
 * Properties — the real source of phone / address / PAN, read from the
 * SIDELOAD first and the readonly hash only as a last resort.
 * See the file header, "Contact/address fields", for why.
 * ═══════════════════════════════════════════════════════════════════════ */

/** One sideloaded Property resource, flattened the same way `client.ts` flattens every other resource. Built by `sync.ts` from the `included` array of `?include=properties`; this file never fetches one. */
export type ClientPropertyRecord = BooqableFlatResource<BooqablePropertyEntity, BooqablePropertyAttributes>

/**
 * The exact `include` query value the clients fetch must send, and the
 * exact `included[].type` to filter on — one constant so the fetch in
 * `sync.ts` and the resolvers here cannot drift apart. docs #properties:
 * "use `?include=properties` to sideload properties".
 */
export const CLIENT_PROPERTIES_INCLUDE = BOOQABLE_PROPERTY_ENTITY

/**
 * Identifier keys used ONLY by the fallback paths (resolution steps 2 and
 * 3 in the file header) — i.e. when no property of the right
 * `property_type` exists at all, or when there is no sideload to look in.
 * They are the stock/default spellings Booqable's own docs use (the
 * #properties example creates a default phone property with
 * `identifier: "phone"`); they are NOT a claim about this account's
 * configuration, which is exactly why the typed match is tried first.
 * Compared after `normalizePropertyKey`, so "Mobile Number" matches
 * `mobile_number`.
 */
const STOCK_PHONE_KEYS: readonly string[] = ['phone', 'mobile', 'telephone', 'phone_number', 'mobile_number', 'contact_number']
const STOCK_ADDRESS_KEYS: readonly string[] = ['address', 'delivery_address']
/** docs #properties name `billing_address` as a conventional address identifier — deliberately NOT a candidate here; see the file header's address section. */
const BILLING_ADDRESS_KEY = 'billing_address'

function normalizePropertyKey(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized.length > 0 ? normalized : null
}

/** A property's own key, either spelling — `identifier` is the documented hash key, `name` is what it is computed from when left blank, so both are checked. */
function propertyKeyMatches(property: ClientPropertyRecord, keys: readonly string[]): boolean {
  const identifier = normalizePropertyKey(property.identifier)
  if (identifier !== null && keys.includes(identifier)) return true
  const name = normalizePropertyKey(property.name)
  return name !== null && keys.includes(name)
}

/** docs: `value` is "For type text_field, text_area, phone, email, date_field, or select" — absent (not empty) on address properties. */
function propertyValue(property: ClientPropertyRecord): string | null {
  return typeof property.value === 'string' && property.value.trim().length > 0 ? property.value : null
}

/**
 * Documented sort order for an owner's properties: `position` —
 * "Which position the property has relative to other properties of the
 * same owner. This determines the sorting of properties when they are
 * displayed." Ties broken by identifier then id purely so that a batch
 * re-run picks the SAME candidate every time (a mapper that silently
 * changes its mind between runs would churn `payload_hash` and rewrite
 * rows for no reason).
 */
function comparePropertyOrder(a: ClientPropertyRecord, b: ClientPropertyRecord): number {
  const positionA = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER
  const positionB = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER
  if (positionA !== positionB) return positionA - positionB
  const keyA = normalizePropertyKey(a.identifier) ?? normalizePropertyKey(a.name) ?? ''
  const keyB = normalizePropertyKey(b.identifier) ?? normalizePropertyKey(b.name) ?? ''
  if (keyA !== keyB) return keyA < keyB ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * Groups a batch's sideloaded Property resources by owning client id, ready
 * to hand to `ClientSyncContext.clientProperties`.
 *
 * Pure — it takes resources `sync.ts` has already pulled out of `included`
 * and does not fetch anything. It lives here rather than in `sync.ts` so
 * the two halves of the contract (what the mapper needs, how the sideload
 * is shaped into it) stay in one reviewable place, and so the owner_type
 * filter below is written once.
 *
 * Non-client-owned properties are dropped: `included` on a
 * `?include=properties` call carries only this collection's properties
 * today, but `owner_type` is polymorphic across five resource types
 * (types.ts §3b) and an order's or document's property must never be read
 * as a client's phone. Law 17 — the check compares against
 * `BOOQABLE_CLIENT_ENTITY`; the raw wire spelling never appears here.
 */
export function groupClientProperties(
  properties: readonly ClientPropertyRecord[],
): Map<BooqableId, ClientPropertyRecord[]> {
  const grouped = new Map<BooqableId, ClientPropertyRecord[]>()
  for (const property of properties) {
    if (property.owner_type !== BOOQABLE_CLIENT_ENTITY) continue
    const ownerId = property.owner_id
    if (typeof ownerId !== 'string' || ownerId.length === 0) continue
    const bucket = grouped.get(ownerId)
    if (bucket === undefined) grouped.set(ownerId, [property])
    else bucket.push(property)
  }
  for (const bucket of grouped.values()) bucket.sort(comparePropertyOrder)
  return grouped
}

/* ── last-resort readers over the readonly `properties` hash ─────────────
 * Resolution step 3 (file header). Kept — and kept exported — so that a
 * caller with no sideload (an older `sync.ts`, a single-record webhook
 * payload that was not fetched with `?include=properties`) degrades to the
 * previous behaviour instead of resolving nothing at all. A miss returns
 * null and the record is handled exactly like a missing value (phone →
 * conflict, address → null columns), never a crash. */

export function readStringProperty(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/** Same, but tolerant of key spelling — matches on `normalizePropertyKey` so 'Mobile Number' finds `mobile_number`. Returns the first hit in the documented key order, not in hash-insertion order. */
function readStringPropertyByKeys(properties: Record<string, unknown>, keys: readonly string[]): string | null {
  const byNormalizedKey = new Map<string, unknown>()
  for (const [rawKey, value] of Object.entries(properties)) {
    const normalized = normalizePropertyKey(rawKey)
    if (normalized !== null && !byNormalizedKey.has(normalized)) byNormalizedKey.set(normalized, value)
  }
  for (const key of keys) {
    const value = byNormalizedKey.get(key)
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

/** The documented shape of an address-TYPE property (docs #properties: address1/address2/city/region/zipcode/country + first_name/last_name/country_id/province_id/latitude/longitude, of which only the six below have a local column). */
export interface BooqableAddressPropertyValue {
  address1: string | null
  address2: string | null
  city: string | null
  region: string | null
  zipcode: string | null
  country: string | null
}

/** Reads an address out of the readonly hash (resolution step 3). NOTE: the hash's value shape for an address-type property is NOT documented — the docs only ever show scalar values — so this stays defensive and returns null on anything that isn't an object. */
export function readAddressProperty(properties: Record<string, unknown>, key: string): BooqableAddressPropertyValue | null {
  const value = properties[key]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const str = (k: string): string | null => (typeof record[k] === 'string' && (record[k] as string).trim().length > 0 ? (record[k] as string) : null)
  return {
    address1: str('address1'),
    address2: str('address2'),
    city: str('city'),
    region: str('region'),
    zipcode: str('zipcode'),
    country: str('country'),
  }
}

/* ── phone resolution ───────────────────────────────────────────────────── */

/** Which of the three documented paths produced the value — carried so a conflict row (and a future log line) can say whether the account is actually configured the way this mapper expects, rather than leaving "no phone" indistinguishable from "no sideload". */
export type ClientPropertySource = 'property_type' | 'identifier' | 'properties_hash' | 'none'

export interface ResolvedClientPhone {
  /** The candidate's value exactly as Booqable sent it — this, not the normalised form, is what a conflict row shows a human. `null` only when no candidate existed at all. */
  raw: string | null
  /** The `+977…` form, present ONLY when some candidate normalised into a value the `clients_phone_format` CHECK will accept. `null` ⇒ caller must raise a conflict; it must never invent one. */
  normalized: string | null
  source: ClientPropertySource
}

/**
 * Phone, resolved in the file header's documented order.
 *
 * When an account has SEVERAL phone-typed properties (a mobile and a
 * landline, say), every candidate is tried in `position` order and the
 * first one that normalises into the required `+977(97|98)########` shape
 * wins. That is selection among equally-documented candidates, not a rule
 * about which numbers are acceptable — the acceptance rule is
 * `clients_phone_format` in the migration and nothing here widens it. If
 * NONE of them is valid, the first candidate's raw text is returned with
 * `normalized: null` so the conflict row shows a human what was actually
 * on the record.
 */
export function resolveClientPhone(
  properties: readonly ClientPropertyRecord[],
  propertiesHash: Record<string, unknown>,
): ResolvedClientPhone {
  // 1 — typed match. `property_type` is a closed documented enum; an
  // account owner can rename an identifier but cannot invent a type.
  const typed = properties.filter((property) => property.property_type === 'phone')
  const typedHit = pickFirstValidPhone(typed, 'property_type')
  if (typedHit !== null) return typedHit

  // 2 — identifier match, ONLY because step 1 found no phone-typed
  // property (e.g. an account that models its phone as a text_field).
  // Address-typed properties are excluded: they carry no `value`.
  const byIdentifier = properties.filter(
    (property) => property.property_type !== 'address' && propertyKeyMatches(property, STOCK_PHONE_KEYS),
  )
  const identifierHit = pickFirstValidPhone(byIdentifier, 'identifier')
  if (identifierHit !== null) return identifierHit

  // 3 — the readonly hash, for a caller with no sideload at all.
  const fromHash = readStringPropertyByKeys(propertiesHash, STOCK_PHONE_KEYS)
  if (fromHash !== null) {
    const normalized = normalizeClientPhone(fromHash)
    return {
      raw: fromHash,
      normalized: normalized !== null && NEPAL_PHONE_FORMAT.test(normalized) ? normalized : null,
      source: 'properties_hash',
    }
  }

  return { raw: null, normalized: null, source: 'none' }
}

/** Returns null when the candidate list is empty, so the caller can fall through to the next resolution step; returns a result with `normalized: null` when candidates existed but none was valid, which STOPS the fall-through (a real phone that fails the format is a conflict, not a reason to go guessing at hash keys). */
function pickFirstValidPhone(
  candidates: readonly ClientPropertyRecord[],
  source: ClientPropertySource,
): ResolvedClientPhone | null {
  let firstRaw: string | null = null
  for (const candidate of candidates) {
    const raw = propertyValue(candidate)
    if (raw === null) continue
    if (firstRaw === null) firstRaw = raw
    const normalized = normalizeClientPhone(raw)
    if (normalized !== null && NEPAL_PHONE_FORMAT.test(normalized)) return { raw, normalized, source }
  }
  return firstRaw === null ? null : { raw: firstRaw, normalized: null, source }
}

/* ── address resolution ─────────────────────────────────────────────────── */

/**
 * Address, resolved in the file header's documented order: an
 * address-TYPE property first (preferring one identified plainly as
 * `address` over `delivery_address`, and never `billing_address` — see the
 * header), then the readonly hash. Every target column is nullable, so a
 * miss is simply `null`, never a conflict.
 */
export function resolveClientAddress(
  properties: readonly ClientPropertyRecord[],
  propertiesHash: Record<string, unknown>,
): BooqableAddressPropertyValue | null {
  // 1 — typed match, minus the billing candidate.
  const typed = properties.filter(
    (property) =>
      property.property_type === 'address' && !propertyKeyMatches(property, [BILLING_ADDRESS_KEY]),
  )
  const preferred =
    typed.find((property) => propertyKeyMatches(property, ['address'])) ?? typed[0]
  if (preferred !== undefined) return addressFromProperty(preferred)

  // 2/3 — no address-typed property: fall back to the hash under the stock
  // identifier keys. There is no step-2 "identifier match on a sideloaded
  // property" for addresses, because a non-address-typed property has only
  // a flat `value` string and no address columns to read.
  for (const key of STOCK_ADDRESS_KEYS) {
    const fromHash = readAddressProperty(propertiesHash, key)
    if (fromHash !== null) return fromHash
  }
  return null
}

function addressFromProperty(property: ClientPropertyRecord): BooqableAddressPropertyValue {
  const str = (value: string | null | undefined): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null
  return {
    address1: str(property.address1),
    address2: str(property.address2),
    city: str(property.city),
    region: str(property.region),
    zipcode: str(property.zipcode),
    country: str(property.country),
  }
}

/* ── PAN/VAT resolution — identifier-only, and only when configured ─────── */

/**
 * PAN/VAT. Returns `null` unless `identifier` is supplied — see the file
 * header, "Tax identity": `text_field` is the catch-all type, so there is
 * no typed match to prefer here and guessing an identifier would be
 * inventing a product decision. The returned string is NOT validated; the
 * caller checks it against the 9-digit CHECK and conflicts on a miss.
 */
export function resolveClientPanVat(
  properties: readonly ClientPropertyRecord[],
  propertiesHash: Record<string, unknown>,
  identifier: string | undefined,
): string | null {
  const wanted = normalizePropertyKey(identifier)
  if (wanted === null) return null
  for (const property of properties) {
    if (property.property_type === 'address') continue
    if (!propertyKeyMatches(property, [wanted])) continue
    const value = propertyValue(property)
    if (value !== null) return value
  }
  return readStringPropertyByKeys(propertiesHash, [wanted])
}

/* ── type_parent / org_subtype — CONFIRMED source: legal_type ───────────── */

export function mapClientTypeParent(legalType: 'person' | 'commercial'): {
  type_parent: ClientTypeParent
  org_subtype: ClientOrganisationSubtype | null
} {
  return legalType === 'commercial'
    ? { type_parent: 'Organisation', org_subtype: 'Other' }
    : { type_parent: 'Individual', org_subtype: null }
}

/* ── address ──────────────────────────────────────────────────────────── */

function joinAddressLine(address1: string | null, address2: string | null): string | null {
  const parts = [address1, address2].filter((part): part is string => part !== null && part.trim().length > 0)
  return parts.length > 0 ? parts.join(', ') : null
}

/* ── §1 · Booqable client resource → local `clients` rows ────────────────
 *
 * `client_code` and `deactivated_*` handling deliberately live outside the
 * plain "one fields object" shape products.ts/bundles.ts use, because both
 * carry insert-vs-update asymmetry that a shared placeholder value (as
 * products.ts does with `asset_code: ''`) would make easy to accidentally
 * write for real — see the file header on both.
 */

export interface LocalClientFields {
  name: string
  phone: string
  email: string | null
  pan_vat?: string
  type_parent: ClientTypeParent
  org_subtype: ClientOrganisationSubtype | null
  address_line: string | null
  city: string | null
  district: string | null
  postal_code: string | null
  country: string
}

export interface LocalClientInsert extends LocalClientFields {
  client_code: string
  status: ClientStatus
  deactivated_at: string | null
  deactivation_reason?: string
}

export interface LocalClientUpdate extends LocalClientFields {
  /** Present ONLY on a forward Active → Deactivated transition (Law 3 — see file header). Absent otherwise; never reversed back to `null` by this mapper. */
  status?: ClientStatus
  deactivated_at?: string
  deactivation_reason?: string
}

const SYNC_DEACTIVATION_REASON = 'Archived on Booqable side (synced automatically)'

/** `clients_pan_vat_nine_digits` in `0005_clients.sql`, verbatim: `pan_vat is null or pan_vat ~ '^[0-9]{9}$'`. Mirrored so a non-conforming value is conflicted here rather than aborting the INSERT at the database. */
const PAN_VAT_FORMAT = /^[0-9]{9}$/

/** Shared empty tuple for a client with no sideloaded properties — avoids allocating a throwaway array per record, and keeps the `?? []` fallback from widening to `never[]`. */
const EMPTY_PROPERTIES: readonly ClientPropertyRecord[] = []

export function mapClients(
  records: readonly BooqableFlatResource<BooqableClientEntity, BooqableClientAttributes>[],
  ctx: ClientSyncContext,
): PullResult<LocalClientInsert, LocalClientUpdate> {
  const toInsert: LocalClientInsert[] = []
  const toUpdate: LocalRowUpdate<LocalClientUpdate>[] = []
  const conflicts: SyncConflictInsert[] = []
  const phonesSeenThisBatch = new Set<string>()

  for (const record of records) {
    const externalId = record.id
    const localId = ctx.existingRefs.get(externalId)
    const isUpdate = localId !== undefined

    /* ── properties: the sideloaded Property resources owned by THIS client
     * (see file header). Absent from the map ⇒ this client simply has no
     * properties, or the caller supplied no sideload — either way the
     * resolvers below fall through to the readonly hash rather than
     * failing. */
    const properties = ctx.clientProperties.get(externalId) ?? EMPTY_PROPERTIES

    /* ── phone: required, unique, format-locked — see file header. Sourced
     * from the property whose property_type is 'phone' (CONFIRMED: no phone
     * column exists on the client resource). ─────────────────────────────*/
    const resolvedPhone = resolveClientPhone(properties, record.properties)
    const normalizedPhone = resolvedPhone.normalized
    if (normalizedPhone === null) {
      conflicts.push({
        entity: 'clients',
        local_id: localId ?? null,
        external_id: externalId,
        field: 'phone',
        local_value: null,
        // `raw` when a candidate existed but would not normalise; null when
        // the client carries no phone property at all. The two cases are
        // genuinely different for whoever works the conflict queue — one is
        // "fix this number", the other is "this client has no phone in
        // Booqable, or the sideload never arrived" (`source` says which).
        external_value: resolvedPhone.raw,
        owner: 'booqable',
      })
      continue
    }
    const collidesWithExisting = ctx.knownPhones.has(normalizedPhone)
    const collidesInBatch = phonesSeenThisBatch.has(normalizedPhone)
    if (collidesWithExisting || collidesInBatch) {
      conflicts.push({
        entity: 'clients',
        local_id: localId ?? null,
        external_id: externalId,
        field: 'phone',
        local_value: null,
        external_value: normalizedPhone,
        owner: 'booqable',
      })
      continue
    }
    phonesSeenThisBatch.add(normalizedPhone)

    /* ── client_code: minted, insert-only — see file header ────────────── */
    const mintedCode = ctx.mintedClientCodes.get(externalId)
    if (!isUpdate && mintedCode === undefined) {
      conflicts.push({
        entity: 'clients',
        local_id: null,
        external_id: externalId,
        field: 'client_code',
        local_value: null,
        external_value: null,
        owner: 'booqable',
      })
      continue
    }

    const { type_parent, org_subtype } = mapClientTypeParent(record.legal_type)

    /* ── pan_vat: only when the account's identifier has been configured
     * (see file header, "Tax identity"). A value that fails the 9-digit
     * CHECK is conflicted and OMITTED — writing it would abort the insert,
     * and reshaping it would be inventing a rule. Unlike phone this is
     * never fatal to the record: the column is nullable. ─────────────── */
    const rawPanVat = resolveClientPanVat(properties, record.properties, ctx.panVatPropertyIdentifier)
    const panVat = rawPanVat !== null && PAN_VAT_FORMAT.test(rawPanVat) ? rawPanVat : null
    // Held, not pushed yet: `sync_conflicts` takes a plain INSERT (no
    // dedupe key), so logging here would append an identical row on EVERY
    // pass for a record the §7-rule-3 hash check is about to skip as
    // unchanged. Pushed below only on a pass that actually writes.
    const panVatConflict: SyncConflictInsert | null =
      rawPanVat !== null && panVat === null
        ? {
            entity: 'clients',
            local_id: localId ?? null,
            external_id: externalId,
            field: 'pan_vat',
            local_value: null,
            external_value: rawPanVat,
            owner: 'booqable',
          }
        : null

    // Address — the address-TYPE property (see file header); every column
    // nullable, so a miss simply leaves them null.
    const address = resolveClientAddress(properties, record.properties)

    const fields: LocalClientFields = {
      name: record.name,
      phone: normalizedPhone,
      email: record.email,
      ...(panVat !== null ? { pan_vat: panVat } : {}),
      type_parent,
      org_subtype,
      address_line: address !== null ? joinAddressLine(address.address1, address.address2) : null,
      city: address?.city ?? null,
      district: address?.region ?? null,
      postal_code: address?.zipcode ?? null,
      country: address?.country ?? 'Nepal',
    }

    const isArchiving = record.archived && record.archived_at !== null

    if (isUpdate) {
      const updateFields: LocalClientUpdate = {
        ...fields,
        ...(isArchiving
          ? {
              status: 'Deactivated' as ClientStatus,
              deactivated_at: record.archived_at as string,
              deactivation_reason: SYNC_DEACTIVATION_REASON,
            }
          : {}),
      }

      const hash = computeClientPayloadHash(updateFields)
      if (ctx.existingPayloadHashes.get(externalId) === hash) {
        // spec §7 rule 3 — unchanged, no write, no log noise.
        continue
      }

      if (panVatConflict !== null) conflicts.push(panVatConflict)
      toUpdate.push({ id: localId as string, fields: updateFields })
    } else {
      const insertFields: LocalClientInsert = {
        ...fields,
        client_code: mintedCode as string,
        status: isArchiving ? 'Deactivated' : 'Active',
        deactivated_at: isArchiving ? (record.archived_at as string) : null,
        ...(isArchiving ? { deactivation_reason: SYNC_DEACTIVATION_REASON } : {}),
      }
      if (panVatConflict !== null) conflicts.push(panVatConflict)
      toInsert.push(insertFields)
    }
  }

  return { toInsert, toUpdate, conflicts }
}

/* ── §2 · uniform dispatcher for sync.ts ─────────────────────────────────
 * Matches `products.ts`'s `pull(entity, rawRecords, ctx)` call shape so
 * `sync.ts` can drive all seven mapper files identically, even though this
 * file only ever handles the one client entity.
 */

export type ClientEntity = BooqableClientEntity

export function pull(
  entity: ClientEntity,
  rawRecords: readonly BooqableFlatResource<BooqableClientEntity, BooqableClientAttributes>[],
  ctx: ClientSyncContext,
): PullResult<LocalClientInsert, LocalClientUpdate> {
  switch (entity) {
    case BOOQABLE_CLIENT_ENTITY:
      return mapClients(rawRecords, ctx)
  }
}
