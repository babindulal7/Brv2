/**
 * Booqable v4 API — raw JSON:API wire shapes.
 *
 * ## Law 17 exception
 *
 * PLAN.md §0 law 17: *"the word 'customer' appears nowhere in the UI; the
 * entity is a client."* Booqable's own API resource is literally named
 * `customers`. **This file is the ONE place in the entire Booqable
 * integration allowed to use the word "customer"** — it mirrors Booqable's
 * own wire vocabulary rather than inventing a violation. Every other file
 * (`client.ts`, every mapper, `sync.ts`, `conflicts.ts`, both Edge
 * Functions) must say "client" only. A "customer" identifier anywhere
 * outside this file is a build defect.
 *
 * ## What this file is, and isn't
 *
 * Raw wire types only — the JSON:API envelope Booqable sends back
 * (`data` / `attributes` / `relationships` / `included`), field names as
 * literally as they can be determined without live API access. No mapping,
 * no business logic (Law 1 — that lives in the rest of `src/lib/booqable/`,
 * never here and never in a screen). `client.ts` is the only file allowed
 * to import from this one for the wire types themselves; mappers import
 * both this file (source shape) and the local domain types (target shape).
 *
 * ## Money
 *
 * Every amount arrives in minor units already, on a field suffixed
 * `_in_cents` — maps 1:1 into `Paisa` (`lib/money.ts`), multiply nothing.
 * Where Booqable also returns a `*_as_decimal` display mirror (e.g. a
 * hypothetical `base_price_as_decimal`), it is display-only on Booqable's
 * side and is deliberately NOT modelled here — nothing in this codebase may
 * read it for arithmetic, so there is nothing for a mapper to accidentally
 * reach for.
 *
 * ## Timestamps
 *
 * Law 8 — Booqable timestamps are AD/UTC already. Every `*_at` field below
 * is the raw ISO-8601 string Booqable returns; store as-is, convert nothing
 * here. BS rendering happens only at the display layer (`lib/bs.ts`).
 *
 * ## Unconfirmed facts — documentation-verification pass, 10 Aug 2026
 *
 * Six facts about the live Booqable v4 API were flagged in the spec (§3.2)
 * as unverified. On 10 Aug 2026 a verification pass against the official v4
 * docs (https://developers.booqable.com) settled facts 1, 3, 4 and 5
 * outright, partially settled fact 6, and confirmed fact 2 is genuinely
 * undocumented. `UNCONFIRMED_BOOQABLE_FACTS` below remains the single named
 * home for all six — each entry now states what is CONFIRMED (with source
 * URL) and what, if anything, is still open. Docs-verified attribute shapes
 * in this file carry a `// docs:` comment naming their source section.
 */

/* ── UNCONFIRMED_BOOQABLE_FACTS — spec §3.2, verified against the official
 * v4 docs (developers.booqable.com) on 10 Aug 2026. Entries marked CONFIRMED
 * are settled — cite the source URL instead of re-deriving; entries marked
 * (PARTIALLY) UNCONFIRMED name exactly what is still open. Never re-answer a
 * CONFIRMED entry from memory.
 * ────────────────────────────────────────────────────────────────────── */
export const UNCONFIRMED_BOOQABLE_FACTS = {
  1: 'CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#orders-statuses, #orders-fields): order status is new | draft | reserved | started | stopped | archived | canceled. The assumed "concept" is actually "draft" ("The draft status used to be named concept" — v1 APIs/webhooks still return "concept"), and "canceled" was missing. Only new/draft/reserved are writable, at creation; later transitions go via the OrderStatusTransition and OrderFulfillment resources. An order can be in a MIXED state — the readonly `statuses` array and `status_counts` hash carry the full picture; the singular `status` is a simplification. payment_status and fulfillment_type are separate axes, not statuses.',
  2: 'STILL UNCONFIRMED 10 Aug 2026 — and now verified to be genuinely undocumented. The whole v4 reference documents rate limiting ONLY as the 429 error entry ("Too Many Requests -- You\'re doing too many requests! Slow down!"). No numeric limits, no scope (token/account/IP), no X-RateLimit-* headers, no Retry-After guarantee, anywhere (v1 docs have nothing either). Backoff must not require those headers — use them opportunistically if present, exponential backoff with jitter otherwise. Log all response headers on the first real 429 observed in staging to close this empirically.',
  3: 'CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#webhook-endpoints, #webhooks): v4 documents NO webhook signing at all — webhook_endpoints has exactly six fields (created_at, events, id, updated_at, url, version), no signing secret exists, and no delivery headers are documented, so an HMAC-header scheme cannot work. Envelope IS confirmed: v4 = { id (notification uuid, NOT the resource), created_at, event, resource_type, data } as application/json; v1 uses `object` instead of `resource_type` and arrives urlencoded. The resource\'s own id is data.id. Payload is plain JSON, not JSON:API. Event enum is closed (45 names): there is NO order.created / product.updated / product.archived / stock_item.* / payment.created / document.* — use order.* status events + order.updated, product_group.*, payment.completed, invoice/contract/quote.*. Verification fallback: GET /api/4/webhooks/{id}.',
  4: 'CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#payments, #payment-charges, #payment-authorizations, #payment-refunds, #deposit-holds, #orders): a deposit is NOT a payment kind — it is a monetary DIMENSION on EVERY payment record. Payments is polymorphic (payment_charges | payment_authorizations | payment_refunds) and all three carry amount_in_cents (main/rental), deposit_in_cents (deposit portion) and total_in_cents (= amount + deposit); a single charge can be part revenue, part deposit. Orders carry deposit_type/deposit_value plus six readonly deposit_*_in_cents tracking fields. deposit_holds (POST-only) WITHHOLDS already-collected deposit (creates a `deposit_charge` line); deposit release is either an authorization cancel/expiry (deposit_released_in_cents, no refund record) or a payment_refund whose deposit_in_cents carries the released portion.',
  5: 'CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#orders-list-orders and every list endpoint): pagination is JSON:API page[number]/page[size] ("The page to request." / "The amount of items per page."). No cursor exists anywhere in the v4 reference. Response links carry ONLY self/first/last — there is NO links.next/prev, and meta defaults to {}. Totals are opt-in: ?meta[total][]=count (response shape undocumented) or ?stats[total]=count → meta.stats.total.count. Default page size 25 is implied by doc examples only (not stated in prose); the MAXIMUM page size is undocumented — always pass page[size] explicitly and stop when a page comes back short/empty.',
  6: 'PARTIALLY CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#customers-archive-a-customer, #products-archive-a-product, #orders-statuses): archiving IS v4\'s only delete — DELETE /customers/{id} and /products/{id} are titled "Archive a …" and their documented 200 responses return the FULL record with archived:true/archived_at set; orders have no DELETE at all (archived is a status, reached via OrderStatusTransition). List filters exist: filter[archived] (boolean) + filter[archived_at] on customers/products, filter[status]/filter[statuses] on orders — so sync can request archived records explicitly instead of relying on default visibility. STILL OPEN: whether GET by id returns 200 after archive (implied by the archive endpoint returning the full record, but never stated), and whether lists exclude archived by default. Confirm with one live sandbox call.',
} as const

/* ── JSON:API envelope — generic over every resource below ────────────── */

export type BooqableId = string

/** A bare `{ id, type }` pointer, as it appears inside a `relationships.*.data`. */
export interface BooqableResourceIdentifier<TType extends string = string> {
  id: BooqableId
  type: TType
}

/**
 * One relationship entry. `data` is a single identifier (or `null`) for a
 * to-one relationship, or an array for a to-many one — JSON:API does not
 * distinguish the two at the type level; callers use `resolveRelated` vs
 * `resolveRelatedMany` in `client.ts` based on which the field is known to be.
 */
export interface BooqableRelationship<TType extends string = string> {
  data: BooqableResourceIdentifier<TType> | BooqableResourceIdentifier<TType>[] | null
}

/**
 * One JSON:API resource object — either top-level `data` or an `included`
 * entry. `TRelationships` is constrained to `object`, not
 * `Record<string, BooqableRelationship>` — a named interface like
 * `BooqableOrderRelationships` (no index signature) does not structurally
 * satisfy a `Record<string, …>` constraint even though every property it
 * does declare is a `BooqableRelationship`, so the stricter constraint
 * would force every per-resource relationships interface to carry a
 * redundant index signature just to be usable as a type argument here.
 */
export interface BooqableResource<
  TType extends string,
  TAttributes,
  TRelationships extends object = Record<string, BooqableRelationship>,
> {
  id: BooqableId
  type: TType
  attributes: TAttributes
  relationships?: Partial<TRelationships>
}

/**
 * An `included` entry. Untyped on purpose — a single response's `included`
 * array mixes several resource `type`s together (an order's included array
 * might carry customers, order_lines and payments side by side), so this
 * cannot carry one specific `TAttributes`. `client.ts`'s `resolveRelated` /
 * `resolveRelatedMany` narrow to a caller-supplied shape at the point of use.
 */
export interface BooqableIncludedResource {
  id: BooqableId
  type: string
  attributes: Record<string, unknown>
  relationships?: Record<string, BooqableRelationship>
}

/**
 * Pagination + result-count metadata. CONFIRMED 10 Aug 2026 — see
 * UNCONFIRMED_BOOQABLE_FACTS[5]: `meta` is `{}` by default. Totals are
 * opt-in: `?stats[total]=count` → `meta.stats.total.count` (documented,
 * "always computed over the unpaginated filtered collection"), or
 * `?meta[total][]=count` (its response shape is undocumented — hence the
 * index signature stays; verify empirically before depending on it).
 */
export interface BooqablePageMeta {
  /** docs: Stats section — populated only when the request opted in via `?stats[total]=count`. */
  stats?: {
    total?: { count: number }
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Top-level envelope `links`. CONFIRMED 10 Aug 2026 (UNCONFIRMED_BOOQABLE_FACTS[5]):
 * v4 list responses carry ONLY `self`/`first`/`last` (relative URLs) — there
 * is NO `links.next`/`links.prev` and no cursor anywhere in the v4 docs.
 * A pagination loop must stop on a short/empty page (or a precomputed
 * total), never wait for a `next` link that will never come.
 */
export interface BooqableLinks {
  self?: string
  first?: string
  last?: string
}

export interface BooqableListResponse<
  TType extends string,
  TAttributes,
  TRelationships extends object = Record<string, BooqableRelationship>,
> {
  data: BooqableResource<TType, TAttributes, TRelationships>[]
  included?: BooqableIncludedResource[]
  meta?: BooqablePageMeta
  links?: BooqableLinks
}

export interface BooqableSingleResponse<
  TType extends string,
  TAttributes,
  TRelationships extends object = Record<string, BooqableRelationship>,
> {
  data: BooqableResource<TType, TAttributes, TRelationships>
  included?: BooqableIncludedResource[]
  meta?: BooqablePageMeta
  links?: BooqableLinks
}

/** JSON:API error object, as returned on a non-2xx response. */
export interface BooqableErrorObject {
  id?: string
  status?: string
  code?: string
  title?: string
  detail?: string
  source?: { pointer?: string; parameter?: string }
}

export interface BooqableErrorResponse {
  errors: BooqableErrorObject[]
}

/** Every resource `type` string this integration reads or writes. Kept as one literal union so the Edge Function allowlist (a separate file) and `client.ts` both check against the same list rather than two independently typed ones. */
export type BooqableResourceTypeName =
  | 'orders'
  | 'order_lines'
  | 'customers'
  | 'properties'
  | 'products'
  | 'product_groups'
  | 'stock_items'
  | 'bundles'
  | 'bundle_items'
  | 'collections'
  | 'plannings'
  | 'availabilities'
  | 'documents'
  | 'payments'
  | 'payment_methods'
  | 'locations'
  | 'tax_rates'
  | 'coupons'
  | 'barcodes'

/* ── §1 · Order ─────────────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 — UNCONFIRMED_BOOQABLE_FACTS[1] resolved.
 * docs: https://developers.booqable.com/#orders-fields / #orders-statuses.
 * `draft` used to be named `concept` — v1 APIs and v1 WEBHOOKS still return
 * "concept"; only new/draft/reserved are writable, and only at creation. */
export type BooqableOrderStatus = 'new' | 'draft' | 'reserved' | 'started' | 'stopped' | 'archived' | 'canceled'

/** docs: Orders Fields + Deposit Handling — how the order's deposit target is calculated. Shared verbatim by the customer resource's own `deposit_type`. */
export type BooqableDepositType = 'none' | 'percentage_total' | 'percentage' | 'fixed'

/** docs: Orders Fields — `process_deposit` = "A deposit needs to be processed"; a deposit-workflow state, not a revenue state. */
export type BooqableOrderPaymentStatus = 'paid' | 'partially_paid' | 'overpaid' | 'payment_due' | 'process_deposit'

export interface BooqableOrderAttributes {
  /** docs: "integer readonly — The unique order number" (an integer, NOT a string). */
  number: number
  /**
   * docs: readonly-after-create, and a SIMPLIFICATION — "An order can be in
   * a mixed state (i.e. partially started or stopped)"; `statuses` +
   * `status_counts` below carry the full picture and mixed-state handling
   * must read those, not this field alone.
   */
  status: BooqableOrderStatus
  /** docs: readonly — "Status(es) of planned products." */
  statuses: BooqableOrderStatus[]
  /** docs: readonly hash — e.g. { "draft": 0, "reserved": 2, "started": 5, "stopped": 10 }. */
  status_counts: Partial<Record<BooqableOrderStatus, number>>
  starts_at: string | null
  stops_at: string | null
  /** docs: "Subtotal excl. taxes (excl. deposit)". */
  price_in_cents: number
  /** docs: "Total excl. taxes (excl. deposit)". */
  grand_total_in_cents: number
  /** docs: "Amount incl. taxes (excl. deposit)". */
  grand_total_with_tax_in_cents: number
  /** docs: "total order amount including rental amount, taxes, and deposit" — the ONE total that includes deposit. */
  total_in_cents: number
  /** docs: "Amount that (still) has to be paid". */
  to_be_paid_in_cents: number
  tax_in_cents: number
  discount_in_cents: number
  /** A percentage, not an amount — stays a plain number, never `Paisa`, same convention `PriceInput.discountPercent` uses in `lib/money.ts`. */
  discount_percentage: number | null
  /* ── deposit block — CONFIRMED, UNCONFIRMED_BOOQABLE_FACTS[4], docs:
   * #orders (Fields + Deposit Handling). All *_in_cents fields readonly.
   * Order totals EXCLUDE deposit except `total_in_cents` above. Law 5:
   * these are read ONLY by the payments-side deposit ledger mapping
   * (`map/payments.ts` owns the classifier) — never into `payments`. */
  deposit_type: BooqableDepositType | null
  deposit_value: number
  /** The computed deposit target for the order. */
  deposit_in_cents: number
  deposit_paid_in_cents: number
  deposit_to_be_paid_in_cents: number
  /** Amount withheld via the deposit_holds resource (e.g. damages). */
  deposit_held_in_cents: number
  deposit_refunded_in_cents: number
  deposit_to_refund_in_cents: number
  payment_status: BooqableOrderPaymentStatus
  /** docs: pickup | delivery — its own axis, NOT part of `status`. */
  fulfillment_type: 'pickup' | 'delivery'
  customer_id: BooqableId | null
  /* docs: orders carry start_location_id / stop_location_id — there is NO
   * single `location_id` on the order resource. */
  start_location_id: BooqableId | null
  stop_location_id: BooqableId | null
  coupon_id: BooqableId | null
  tax_region_id: BooqableId | null
  tag_list: string[]
  item_count: number
  /* Law 3 note — orders have NO archived/archived_at attributes (CONFIRMED:
   * absent from the Fields table); "archived" is a STATUS value, reached via
   * OrderStatusTransition, and orders have no DELETE endpoint at all. See
   * UNCONFIRMED_BOOQABLE_FACTS[6]. */
  created_at: string
  updated_at: string
}

export interface BooqableOrderRelationships {
  customer: BooqableRelationship<'customers'>
  order_lines: BooqableRelationship<'order_lines'>
  payments: BooqableRelationship<'payments'>
  documents: BooqableRelationship<'documents'>
  plannings: BooqableRelationship<'plannings'>
  /** docs: orders relate to start_location / stop_location, not a single `location`. */
  start_location: BooqableRelationship<'locations'>
  stop_location: BooqableRelationship<'locations'>
}

export type BooqableOrder = BooqableResource<'orders', BooqableOrderAttributes, BooqableOrderRelationships>

/**
 * Law 17 boundary accessor for the order's client-reference wire field, same
 * purpose as `BOOQABLE_CLIENT_ENTITY` below but for a single field instead of
 * a whole resource name: `map/orders.ts` (and every other file outside this
 * one) calls this instead of touching the raw attribute name directly, so
 * the raw name stays confined to this one file even at the field-access
 * level, not just in the exported type shapes.
 */
export function getOrderClientRefId(record: Pick<BooqableOrderAttributes, 'customer_id'>): BooqableId | null {
  return record.customer_id
}

/* ── §2 · Order line ────────────────────────────────────────────────────
 * PARTIALLY CONFIRMED 10 Aug 2026 — the v4 Lines resource documents a `type`
 * enum of exactly: charge | section | deposit_charge | proration | refund |
 * delivery_rate | legacy_migration (docs: https://developers.booqable.com/#lines).
 * `deposit_charge` — "A deposit charge line generated by a deposit hold
 * action" — is the deposit-shaped line kind UNCONFIRMED_BOOQABLE_FACTS[4]
 * asked about (a deposit HOLD converts trust money into this line; ordinary
 * deposit collection is a payment dimension, not a line). The rest of this
 * section's field shape (item_id/quantity/planned_*) was NOT covered by the
 * verification pass and stays a best-effort guess; 'product'/'bundle' are
 * kept as legacy guesses and the union stays widened with `| string` so an
 * unlisted value still parses. */
export type BooqableOrderLineItemType =
  | 'charge'
  | 'section'
  | 'deposit_charge'
  | 'proration'
  | 'refund'
  | 'delivery_rate'
  | 'legacy_migration'
  | 'product'
  | 'bundle'
  | (string & {})

export interface BooqableOrderLineAttributes {
  order_id: BooqableId
  item_id: BooqableId | null
  item_type: BooqableOrderLineItemType
  title: string
  quantity: number
  price_in_cents: number
  tax_in_cents: number
  total_in_cents: number
  discount_in_cents: number | null
  planned_starts_at: string | null
  planned_stops_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableOrderLineRelationships {
  order: BooqableRelationship<'orders'>
  product: BooqableRelationship<'products'>
  tax_rate: BooqableRelationship<'tax_rates'>
}

export type BooqableOrderLine = BooqableResource<'order_lines', BooqableOrderLineAttributes, BooqableOrderLineRelationships>

/* ── §3 · Customer (Law 17 exception applies to this whole section) ─────
 * CONFIRMED 10 Aug 2026 — docs: https://developers.booqable.com/#customers
 * and #properties. The resource has NO phone / company_name / address1/2 /
 * city / region / zipcode / country / tax_number columns (the scaffold
 * invented all of those): contact/address data lives in separate Property
 * resources (property_type: address | date_field | email | phone | select |
 * text_area | text_field; address-type properties carry address1/address2/
 * city/region/zipcode/country/province_id), surfaced on the record as the
 * readonly `properties` hash ("A hash containing all basic property values",
 * keyed by account-configured property identifiers) and written via the
 * writeonly `properties_attributes` array. The person-vs-company field is
 * `legal_type` ("Either person or commercial") — resolves the scaffold's
 * `customer_type` TODO. */

export interface BooqableCustomerAttributes {
  /** docs: "Person or Company name". */
  name: string
  email: string | null
  /** docs: integer readonly. */
  number: number
  legal_type: 'person' | 'commercial'
  /** Same enum as the order's deposit_type — when a customer is assigned, "the order will inherit the tax region and deposit from the customer." */
  deposit_type: BooqableDepositType | null
  deposit_value: number
  discount_percentage: number | null
  email_marketing_consented: boolean
  email_marketing_consent_updated_at: string | null
  merge_suggestion_customer_id: BooqableId | null
  stripe_id: string | null
  tax_region_id: BooqableId | null
  tag_list: string[]
  /** docs: hash readonly — "A hash containing all basic property values" (phone/address live HERE, keyed by account-configured property identifiers). */
  properties: Record<string, unknown>
  /* readonly stats */
  order_count: number
  revenue_in_cents: number
  average_order_value_in_cents: number
  balance_due_in_cents: number
  latest_order_at: string | null
  /** Law 3 — archive, never delete; mapped to a local terminal state. CONFIRMED (fact 6): DELETE /customers/{id} is documented as "Archive a customer" and returns the full record with archived:true. */
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableCustomerRelationships {
  barcode: BooqableRelationship<'barcodes'>
  properties: BooqableRelationship<'properties'>
  payment_methods: BooqableRelationship<'payment_methods'>
  tax_region: BooqableRelationship<'tax_regions'>
}

export type BooqableCustomer = BooqableResource<'customers', BooqableCustomerAttributes, BooqableCustomerRelationships>

/**
 * Client-named re-exports of the §3 shapes above, for every file outside
 * this one (Law 17 exception, see file header). `client.ts`, the mapper in
 * `map/clients.ts`, `sync.ts`, and `conflicts.ts` must import these instead
 * of reaching for `BooqableCustomer*`/the raw `'customers'` literal
 * directly — that keeps the banned word confined to this file's §3 section
 * even at the type/value level, not just in prose.
 */
export type BooqableClientAttributes = BooqableCustomerAttributes
export type BooqableClientRelationships = BooqableCustomerRelationships
export const BOOQABLE_CLIENT_ENTITY = 'customers' as const
export type BooqableClientEntity = typeof BOOQABLE_CLIENT_ENTITY

/* ── §3b · Property (Booqable's custom-field resource) ──────────────────
 * CONFIRMED 10 Aug 2026 — docs: https://developers.booqable.com/#properties.
 * Every field below is copied from that section's own Fields table; the
 * enums are its own closed lists, not inferred.
 *
 * This is where a client's phone / address / any custom text actually
 * lives — §3 above has NO such columns. Two ways to read a property, both
 * documented verbatim in #properties:
 *
 *   1. the owner's readonly `properties` HASH — "A hash containing all
 *      basic property values", keyed by the ACCOUNT-CONFIGURED
 *      `identifier` (the docs' own example: `"properties": { "phone":
 *      "+316000000" }`). Cheap, but the key is free text an account owner
 *      can rename, and the hash's value shape for an address-type property
 *      is not documented anywhere.
 *   2. SIDELOADING — "When you need more details than provided by the
 *      `properties` attribute, use `?include=properties` to sideload
 *      properties instead of querying them separately." Each sideloaded
 *      entry is a full Property resource carrying `property_type` (a CLOSED
 *      documented enum) and, for address properties, the individual
 *      address columns. This is the robust path: match on the type, not on
 *      an account-renameable identifier string.
 *
 * Writes go the other way — the owner's writeonly `properties_attributes`
 * array ("Manage properties through their owner"), NOT a POST to this
 * resource. `map/clients.ts` documents that shape; note that the array's
 * `_destroy: true` entry is a real DELETE on Booqable's side and is barred
 * here by Law 3 (nothing is deleted) regardless of what the API allows.
 *
 * (`owner_type`'s 'customers' member is Booqable's own wire vocabulary —
 * Law 17 exception, this file only. Outside this file, compare against
 * `BOOQABLE_CLIENT_ENTITY` above rather than spelling the literal.) */

/** docs: property_type — "Determines how the data is rendered and the kind of input shown to the user. One of: address, date_field, email, phone, select, text_area, text_field." */
export type BooqablePropertyType =
  | 'address'
  | 'date_field'
  | 'email'
  | 'phone'
  | 'select'
  | 'text_area'
  | 'text_field'

/** docs: owner_type — "The resource type of the owner. One of: customers, documents, orders, product_groups, stock_items." */
export type BooqablePropertyOwnerType = 'customers' | 'documents' | 'orders' | 'product_groups' | 'stock_items'

/** docs: show_on — "Array of document types to show this custom field on. Zero or more from contract, invoice, packing, quote." */
export type BooqablePropertyShowOn = 'contract' | 'invoice' | 'packing' | 'quote'

export interface BooqablePropertyAttributes {
  /** docs: "Name of the property (used as label and to compute identifier if left blank)." */
  name: string | null
  /** docs: "Key that will be used in exports, responses and custom field variables in templates." — this is the key the owner's `properties` hash is keyed by, and it is ACCOUNT-CONFIGURED free text. */
  identifier: string | null
  property_type: BooqablePropertyType
  /** docs: "For type text_field, text_area, phone, email, date_field, or select." — absent on address-type properties, hence optional. */
  value?: string | null
  /** docs: uuid readonly-after-create — "The resource this property is about." */
  owner_id: BooqableId
  owner_type: BooqablePropertyOwnerType
  /** docs: nullable — "Properties without default property are called 'one-off' properties." */
  default_property_id: BooqableId | null
  /** docs: "Which position the property has relative to other properties of the same owner." — the documented sort order for an owner's properties. */
  position?: number | null
  show_on?: BooqablePropertyShowOn[] | null
  validation_required?: boolean
  /** docs: readonly — "Whether this property meets the validation requirements." */
  meets_validation_requirements?: boolean
  /* ── address-type only ("For type address."), all optional because they
   * are simply absent on the six value-bearing types above. */
  first_name?: string | null
  last_name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  zipcode?: string | null
  country?: string | null
  /** docs: "For type address." — the resolved Country record's id; a string uuid, NOT a country name. */
  country_id?: string | null
  province_id?: string | null
  latitude?: string | null
  longitude?: string | null
  created_at: string
  updated_at: string
}

export interface BooqablePropertyRelationships {
  /** docs: optional — "The DefaultProperty this property is linked to." */
  default_property: BooqableRelationship<'default_properties'>
  /** docs: required — "The resource this property is about." Polymorphic across `BooqablePropertyOwnerType`. */
  owner: BooqableRelationship<BooqablePropertyOwnerType>
}

export type BooqableProperty = BooqableResource<'properties', BooqablePropertyAttributes, BooqablePropertyRelationships>

/** The sideload/resource-type literal, named so callers say `BOOQABLE_PROPERTY_ENTITY` instead of re-spelling it (same convention as `BOOQABLE_CLIENT_ENTITY`). Also the exact value `?include=` takes. */
export const BOOQABLE_PROPERTY_ENTITY = 'properties' as const
export type BooqablePropertyEntity = typeof BOOQABLE_PROPERTY_ENTITY

/* ── §4 · Product ───────────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 — docs: https://developers.booqable.com/#products.
 * The price field is `base_price_in_cents` ("The value that is being
 * calculated with"), NOT `price_in_cents`. Products have NO `barcode`
 * attribute — a product's barcode is a separate owned Barcode resource
 * (§6b below). `product_type` (inherited from ProductGroup, readonly) is
 * rental | sales_item | service — docs note "The sales_item type used to be
 * called consumable. v1 apis and webhooks will return consumable"; there is
 * no 'bulk' value — bulk-vs-tracked is the separate `trackable` boolean
 * ("Whether stock items are tracked"). `name`/`sku` are inherited readonly
 * from the ProductGroup — pushes must target the group, not the product.
 * The product-level `deposit_in_cents` is Booqable's per-item default
 * deposit — still a DIFFERENT question from a specific order's deposit
 * (see UNCONFIRMED_BOOQABLE_FACTS[4]); never conflate the two. */
export type BooqableProductType = 'rental' | 'sales_item' | 'service'

export interface BooqableProductAttributes {
  name: string
  sku: string | null
  /** docs: base_price_in_cents — "The value that is being calculated with". */
  base_price_in_cents: number | null
  deposit_in_cents: number | null
  product_type: BooqableProductType
  trackable: boolean
  archived: boolean
  archived_at: string | null
  product_group_id: BooqableId | null
  created_at: string
  updated_at: string
}

export interface BooqableProductRelationships {
  product_group: BooqableRelationship<'product_groups'>
  stock_items: BooqableRelationship<'stock_items'>
  tax_rate: BooqableRelationship<'tax_rates'>
}

export type BooqableProduct = BooqableResource<'products', BooqableProductAttributes, BooqableProductRelationships>

/* ── §5 · Product group ────────────────────────────────────────────────── */

export interface BooqableProductGroupAttributes {
  name: string
  description: string | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableProductGroupRelationships {
  products: BooqableRelationship<'products'>
}

export type BooqableProductGroup = BooqableResource<'product_groups', BooqableProductGroupAttributes, BooqableProductGroupRelationships>

/* ── §6 · Stock item ────────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 — docs: https://developers.booqable.com/#stock-items.
 * `status` is a closed readonly enum (below) — the scaffold's guessed
 * available/out/damaged/lost set was wrong. There is NO `barcode` attribute
 * on stock_item — a stock item's barcode is a separate Barcode resource
 * (§6b) reached via the optional `barcode` relationship. `from`/`till`
 * (availability window for temporary/expected items) live HERE, not on
 * orders. */
export type BooqableStockItemStatus =
  | 'archived'
  | 'expected'
  | 'in_stock'
  | 'started'
  | 'overdue'
  | 'expired'
  | 'in_downtime'

export interface BooqableStockItemAttributes {
  /** docs: "Unique identifier (like serial number)". */
  identifier: string | null
  product_id: BooqableId
  product_group_id: BooqableId | null
  status: BooqableStockItemStatus
  stock_item_type: 'regular' | 'temporary'
  from: string | null
  till: string | null
  location_id: BooqableId | null
  purchase_cost_in_cents: number | null
  purchased_at: string | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableStockItemRelationships {
  product: BooqableRelationship<'products'>
  location: BooqableRelationship<'locations'>
  /** docs: "Barcode to quickly identify this StockItem" — optional, a SEPARATE resource, not an attribute. */
  barcode: BooqableRelationship<'barcodes'>
}

export type BooqableStockItem = BooqableResource<'stock_items', BooqableStockItemAttributes, BooqableStockItemRelationships>

/* ── §6b · Barcode ──────────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 — docs: https://developers.booqable.com/#barcodes.
 * Barcodes are their own resource, owned polymorphically — this is why
 * neither products (§4) nor stock items (§6) carry a barcode attribute.
 * (`owner_type`'s 'customers' member is Booqable's wire vocabulary — Law 17
 * exception, this file only.) */
export type BooqableBarcodeType = 'code39' | 'code93' | 'code128' | 'ean8' | 'ean13' | 'qr_code'

export interface BooqableBarcodeAttributes {
  /** docs: "The barcode data, can be a number, code or url. Leave blank to let Booqable create one." */
  number: string | null
  barcode_type: BooqableBarcodeType
  image_url: string | null
  owner_id: BooqableId
  owner_type: 'customers' | 'products' | 'orders' | 'stock_items'
  created_at: string
  updated_at: string
}

export type BooqableBarcode = BooqableResource<'barcodes', BooqableBarcodeAttributes>

/* ── §7 · Bundle + bundle item ──────────────────────────────────────────── */

export interface BooqableBundleAttributes {
  name: string
  price_in_cents: number
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableBundleRelationships {
  bundle_items: BooqableRelationship<'bundle_items'>
}

export type BooqableBundle = BooqableResource<'bundles', BooqableBundleAttributes, BooqableBundleRelationships>

export interface BooqableBundleItemAttributes {
  bundle_id: BooqableId
  product_id: BooqableId
  quantity: number
  created_at: string
  updated_at: string
}

export interface BooqableBundleItemRelationships {
  bundle: BooqableRelationship<'bundles'>
  product: BooqableRelationship<'products'>
}

export type BooqableBundleItem = BooqableResource<'bundle_items', BooqableBundleItemAttributes, BooqableBundleItemRelationships>

/* ── §8 · Collection ────────────────────────────────────────────────────── */

export interface BooqableCollectionAttributes {
  name: string
  description: string | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableCollectionRelationships {
  products: BooqableRelationship<'products'>
}

export type BooqableCollection = BooqableResource<'collections', BooqableCollectionAttributes, BooqableCollectionRelationships>

/* ── §9 · Planning ──────────────────────────────────────────────────────
 * TODO(decision) — planning is Booqable's stock-reservation record for a
 * given order line over a date range; whether it exposes its own status
 * enum (vs. simply inheriting the order's) is unconfirmed. */
export interface BooqablePlanningAttributes {
  order_id: BooqableId
  item_id: BooqableId | null
  item_type: string
  starts_at: string
  stops_at: string
  quantity: number
  reserved: boolean
  created_at: string
  updated_at: string
}

export interface BooqablePlanningRelationships {
  order: BooqableRelationship<'orders'>
}

export type BooqablePlanning = BooqableResource<'plannings', BooqablePlanningAttributes, BooqablePlanningRelationships>

/* ── §10 · Availability ─────────────────────────────────────────────────
 * TODO(decision) — availability is typically a computed query response in
 * rental APIs (e.g. "is product X free between two dates"), not a stored,
 * individually-fetchable resource. Whether Booqable v4 wraps it in the same
 * JSON:API resource envelope as everything else, or returns a bespoke
 * shape, is unconfirmed. Modelled here as the plausible minimum a stock
 * check needs, in the same envelope shape as the rest of this file so
 * `client.ts`'s generic parsing still applies if it turns out to be right —
 * treat this one resource, specifically, as the least trustworthy shape in
 * the file. */
export interface BooqableAvailabilityAttributes {
  product_id: BooqableId
  location_id: BooqableId | null
  starts_at: string
  stops_at: string
  available: number
  stock_count: number
  planned_count: number
}

export type BooqableAvailability = BooqableResource<'availabilities', BooqableAvailabilityAttributes>

/* ── §11 · Document (invoice / quote / contract / packing slip) ─────────
 * Covers the four document kinds the spec names; Booqable's registry of
 * document types may be wider (e.g. credit notes) — `document_type` is
 * widened with `| string` so an unlisted kind still parses. */
export type BooqableDocumentType = 'invoice' | 'quote' | 'contract' | 'packing_slip' | (string & {})

export interface BooqableDocumentAttributes {
  order_id: BooqableId | null
  document_type: BooqableDocumentType
  number: string | null
  /** TODO(decision) — genuinely uncertain: the attribute name Booqable uses for a rendered-PDF URL (if it exposes one on the resource itself, vs. a separate download endpoint) is not confirmed. */
  document_url: string | null
  total_in_cents: number | null
  tax_in_cents: number | null
  issued_at: string | null
  created_at: string
  updated_at: string
}

export interface BooqableDocumentRelationships {
  order: BooqableRelationship<'orders'>
}

export type BooqableDocument = BooqableResource<'documents', BooqableDocumentAttributes, BooqableDocumentRelationships>

/* ── §12 · Payment ──────────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 — UNCONFIRMED_BOOQABLE_FACTS[4] resolved. docs:
 * https://developers.booqable.com/#payments, #payment-charges,
 * #payment-authorizations, #payment-refunds.
 *
 * Payments is a POLYMORPHIC resource — "three distinct payment types":
 * PaymentCharges ("Direct charges for orders or carts"),
 * PaymentAuthorizations ("Pre-authorizations that can be captured later"),
 * PaymentRefunds ("Refunds for previously charged amounts"). The
 * discriminator is the JSON:API `type` itself (payment_charges |
 * payment_authorizations | payment_refunds) — there is NO `payment_type` /
 * `kind` attribute, and NONE of the three types means "deposit".
 *
 * Law 5 — THE answer to fact 4: a deposit is a monetary DIMENSION on EVERY
 * payment record, not a payment kind. Financial Tracking (docs, verbatim
 * semantics): `amount_in_cents` = "The main payment amount (e.g., rental
 * charges)", `deposit_in_cents` = "The deposit portion", `total_in_cents`
 * "Always equals amount + deposit", and "These amounts are immutable once
 * set to maintain financial integrity." A single charge can be part
 * revenue, part deposit — the Law 5 classifier (`map/payments.ts`) must
 * treat the split per-record, never classify the whole record by type.
 *
 * Law 4 — imported payments are insert-only; a changed Booqable payment
 * becomes a reversal row plus a new row locally, never an UPDATE. That
 * mapping rule lives in the payments mapper, not here.
 *
 * There is no plain `paid_at` — the success timestamp is `succeeded_at`. */

/** The polymorphic resource/`type` discriminator — closed, documented union. */
export type BooqablePaymentResourceType = 'payment_charges' | 'payment_authorizations' | 'payment_refunds'

/** Kept as an alias of the discriminator union so older imports keep meaning something true — the separate `payment_type` ATTRIBUTE the scaffold guessed does not exist on the wire. */
export type BooqablePaymentType = BooqablePaymentResourceType

/** docs: stripe | app | none — "none - No payment provider (typically for manual mode)"; for refunds, "Manual refund (cash, bank transfer, etc.)". */
export type BooqablePaymentProvider = 'stripe' | 'app' | 'none'

/** docs: charge status enum created|started|action_required|processing|succeeded|failed|canceled|expired; refund status enum created|pending|action_required|succeeded|failed|canceled. Combined union — narrow per subtype if it ever matters. */
export type BooqablePaymentStatus =
  | 'created'
  | 'started'
  | 'pending'
  | 'action_required'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'expired'

export interface BooqablePaymentAttributes {
  /** docs: nullable — cart payments exist (`cart_id`), so an order id is NOT guaranteed. */
  order_id: BooqableId | null
  cart_id: BooqableId | null
  customer_id: BooqableId | null
  employee_id: BooqableId | null
  payment_method_id: BooqableId | null
  /** Links a refund to its charge — "required for connected refunds but optional for standalone manual refunds". */
  payment_charge_id: BooqableId | null
  /** Links a capture-mode charge to its authorization. */
  payment_authorization_id: BooqableId | null
  /** docs: "The main payment amount (e.g., rental charges)" — EXCLUDES deposit. */
  amount_in_cents: number
  /** docs: "The deposit portion" — Law 5: routes to the trust/deposit ledger, never `payments`. */
  deposit_in_cents: number
  /** docs: "Always equals amount + deposit". */
  total_in_cents: number
  currency: string
  status: BooqablePaymentStatus
  /** charge mode: manual|off_session|request|terminal|capture; authorization mode: off_session|checkout|request|terminal. Left as string — per-subtype narrowing not needed yet. */
  mode: string | null
  provider: BooqablePaymentProvider | null
  /** Free string (e.g. card, ideal, bancontact). */
  provider_method: string | null
  description: string | null
  failure_reason: string | null
  /** Refund reason — common values requested_by_customer | duplicate | fraudulent (free string). */
  reason: string | null
  succeeded_at: string | null
  failed_at: string | null
  canceled_at: string | null
  expired_at: string | null
  /* ── PaymentCharge extras (absent on other subtypes) ── */
  refundable?: boolean
  amount_refundable_in_cents?: number
  amount_refunded_in_cents?: number
  deposit_refundable_in_cents?: number
  deposit_refunded_in_cents?: number
  total_refundable_in_cents?: number
  total_refunded_in_cents?: number
  /* ── PaymentAuthorization extras — deposit release path 1 (fact 4d):
   * cancellation/expiry "Releases reserved funds back to the customer";
   * deposit_released_in_cents = deposit_in_cents - deposit_captured_in_cents.
   * No refund record is produced for an authorization release. ── */
  capturable?: boolean
  /** docs: capture deadline — "Typically 7 days". */
  capture_before?: string | null
  captured_at?: string | null
  amount_capturable_in_cents?: number
  deposit_capturable_in_cents?: number
  total_capturable_in_cents?: number
  amount_captured_in_cents?: number
  deposit_captured_in_cents?: number
  total_captured_in_cents?: number
  amount_released_in_cents?: number
  deposit_released_in_cents?: number
  total_released_in_cents?: number
  created_at: string
  updated_at: string
}

export interface BooqablePaymentRelationships {
  order: BooqableRelationship<'orders'>
  payment_method: BooqableRelationship<'payment_methods'>
}

export type BooqablePayment = BooqableResource<BooqablePaymentResourceType, BooqablePaymentAttributes, BooqablePaymentRelationships>

/* ── §12b · Deposit hold ────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 — docs: https://developers.booqable.com/#deposit-holds.
 * NOT how a deposit is collected — how part of an already-collected deposit
 * is WITHHELD (e.g. damages) instead of refunded: "A deposit hold is the
 * resource responsible for managing the held deposit on an order." Create
 * (POST /api/4/deposit_holds) is the ONLY documented operation — no
 * update/delete, and no "deposit release" action exists anywhere in v4.
 * Side effect: creates/updates an order Line of type `deposit_charge`; the
 * held amount surfaces as order.deposit_held_in_cents. Law 5: a deposit
 * hold is NOT a payment and must never enter the payments mapping — it is
 * the one legitimate deposit-to-revenue crossing, an explicit ledger event. */
export interface BooqableDepositHoldAttributes {
  order_id: BooqableId
  /** writeonly on create — "If the order already has a hold, the amount will be added to the previous one. The hold is clamped to order.deposit_in_cents." */
  amount_in_cents?: number
  /** writeonly on create — overwrites any previous reason. */
  reason?: string
  /** readonly — "The Line that was created or updated to hold the deposit." */
  deposit_line_id: BooqableId | null
}

export type BooqableDepositHold = BooqableResource<'deposit_holds', BooqableDepositHoldAttributes>

/* ── §13 · Payment method ───────────────────────────────────────────────── */

export interface BooqablePaymentMethodAttributes {
  name: string
  archived: boolean
  created_at: string
  updated_at: string
}

export type BooqablePaymentMethod = BooqableResource<'payment_methods', BooqablePaymentMethodAttributes>

/* ── §14 · Location ─────────────────────────────────────────────────────── */

export interface BooqableLocationAttributes {
  name: string
  address1: string | null
  city: string | null
  country: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export type BooqableLocation = BooqableResource<'locations', BooqableLocationAttributes>

/* ── §15 · Tax rate ─────────────────────────────────────────────────────── */

export interface BooqableTaxRateAttributes {
  name: string
  /** A percentage, not an amount — stays a plain number, mirrors `PriceInput.vatPercent`'s convention. */
  percentage: number
  archived: boolean
  created_at: string
  updated_at: string
}

export type BooqableTaxRate = BooqableResource<'tax_rates', BooqableTaxRateAttributes>

/* ── §16 · Coupon ───────────────────────────────────────────────────────
 * Note for a future mapper (Law 10): a Booqable coupon has no concept of
 * this codebase's discount-approval gate (`discountGate` in `lib/money.ts`
 * — >10% needs a reason ≥10 chars and a named approver, 25% hard cap, no
 * role bypass). An inbound coupon that implies a violating discount must be
 * logged to `sync_conflicts`, never silently applied and never blocked —
 * per spec §4, it already happened on Booqable's side. */
export interface BooqableCouponAttributes {
  code: string
  discount_percentage: number | null
  discount_in_cents: number | null
  archived: boolean
  redeemed_count: number | null
  created_at: string
  updated_at: string
}

export type BooqableCoupon = BooqableResource<'coupons', BooqableCouponAttributes>
