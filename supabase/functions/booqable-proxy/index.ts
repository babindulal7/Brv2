// =============================================================================
// supabase/functions/booqable-proxy/index.ts
//
// Supabase Edge Function (Deno runtime — NOT Node). Uses Deno.serve and
// Deno.env.get exclusively; no `fs`, no CommonJS `require`, no Node built-ins.
//
// This is the ONLY place BOOQABLE_TOKEN / BOOQABLE_SLUG are read. They live in
// Edge Function environment variables and never reach a VITE_-prefixed
// variable or any file under src/ — see PLAN.md §0 "Warehouse sees no money,
// enforced by RLS/proxy, never the UI" and CLAUDE.md's key-handling rule (the
// browser client, src/lib/supabase.ts, is anon-key-only, forever).
//
// Architecture (spec §4): the browser calls THIS function with its Supabase
// session JWT; this function holds the Booqable bearer token and calls
// https://{slug}.booqable.com/api/4. A second function, booqable-webhook (not
// written in this pass — out of scope for this file), receives Booqable's
// webhook POSTs into sync_inbox. Mirror tables feed sync_outbox, which this
// function is also the intended drain path for (see the NOTE near the bottom
// of this file) — but nothing currently schedules that drain; see the
// TODO(decision) there, in the same spirit as booqable-webhook's own
// "don't invent a scheduler" note.
//
// Five responsibilities, in order, each its own clearly separated step:
//   1. Verify the caller's Supabase JWT.                        -> verifyCaller
//   2. Resolve the caller's business-8 role, mirroring the DB.  -> resolveCallerRole
//   3. Path + method allowlist; unlisted = 403, never forwarded. -> matchAllowlist
//   4. Strip money fields for money-blind roles (Law 6).         -> stripMoneyForRole
//   5. Token-bucket rate limit + backoff on 429; log every call. -> callBooqable / logCall
//
// Six API facts (spec §3.2) were verified against the official v4 docs on
// 10 Aug 2026 (see src/lib/booqable/types.ts UNCONFIRMED_BOOQABLE_FACTS for
// the full findings + source URLs): facts 1/3/4/5 CONFIRMED, fact 6
// partially confirmed, fact 2 verified to be genuinely undocumented. Every
// place below that depended on one now cites its confirmed answer, or keeps
// an explicit TODO(decision) for what is still open (rate-limit numbers,
// GET-after-archive, and the exact status-transition endpoint URLs).
// =============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
// Law 17's single named exception: src/lib/booqable/types.ts is the ONE file
// in this integration allowed to spell Booqable's wire-format resource name
// for this entity. Imported under a local alias (matching the name this file
// already uses below) instead of restated as a literal here, so types.ts
// stays that single place even at the value level, not just in identifiers.
// types.ts has no dependencies of its own (pure types/consts), so this
// relative import carries nothing else across the Deno/Vite boundary.
import { BOOQABLE_CLIENT_ENTITY as BOOQABLE_CLIENT_RESOURCE_NAME } from '../../../src/lib/booqable/types.ts'

// -----------------------------------------------------------------------------
// 0 · Environment — Booqable credentials live ONLY here, read via Deno.env.
//     Never logged, never returned in a response body, never embedded in an
//     error message. (grep this file for the literal string BOOQABLE_TOKEN —
//     every occurrence below is a Deno.env.get read or a variable holding
//     that read, nothing else.)
// -----------------------------------------------------------------------------

const BOOQABLE_TOKEN = Deno.env.get('BOOQABLE_TOKEN')
const BOOQABLE_SLUG = Deno.env.get('BOOQABLE_SLUG')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Booqable's own API version path segment. Not one of the six unconfirmed
// facts (the spec states this directly: "calls https://{slug}.booqable.com/api/4"),
// so this is taken as given, not marked TODO(decision).
const BOOQABLE_API_BASE = (slug: string) => `https://${slug}.booqable.com/api/4`

// The path prefix Supabase mounts this function under. Stripped from the
// incoming request's pathname to recover the Booqable-relative path (e.g.
// a request to /functions/v1/booqable-proxy/orders/123 forwards to
// {BOOQABLE_API_BASE}/orders/123). Handles both the local `supabase functions
// serve` shape (/booqable-proxy/...) and the deployed shape
// (/functions/v1/booqable-proxy/...) by matching on the function's own name.
const FUNCTION_NAME = 'booqable-proxy'

// -----------------------------------------------------------------------------
// 1 · System role — mirrored from the database, not re-derived.
//
// Kept as a literal union matching src/types/database.ts's SystemRole exactly
// (the business 9: Owner, Admin, Manager, Coordinator, Warehouse, Technician,
// Accounts, Driver, Client — Manager reopened 9 Aug 2026 by migration
// 0017_reopen_manager_role.sql, grants mirror Admin per 0018).
// -----------------------------------------------------------------------------

type SystemRole =
  | 'Owner'
  | 'Admin'
  | 'Manager'
  | 'Coordinator'
  | 'Warehouse'
  | 'Technician'
  | 'Accounts'
  | 'Driver'
  | 'Client'

// Law 6, widened to the whole floor (migration 0014, restated 0018's
// auth_can_view_money()). Duplicated here deliberately rather than imported:
// this Edge Function deploys independently of the src/ Vite bundle (different
// runtime, different build), so src/lib/rbac.ts's MONEY_BLIND set cannot be
// imported across that boundary without risking a stale bundle silently
// diverging from what actually deployed. If this set is ever changed, the
// database function (0018) and src/lib/rbac.ts MUST change with it — three
// independent copies of one rule, same as the DB/UI pairing the module
// docstring in rbac.ts already calls out.
const MONEY_BLIND_ROLES: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
])

function canViewMoney(role: SystemRole): boolean {
  return !MONEY_BLIND_ROLES.has(role)
}

// -----------------------------------------------------------------------------
// 2 · Path + method allowlist (proxy responsibility 3)
//
// A literal, exported-shape list at the top of the file, per instructions.
// Two lists: the six write-back operations from spec §11 (the ONLY writes
// ever allowed to reach Booqable), and the read paths P1-P2 need. Anything
// not matched by either is a 403, and is never forwarded to Booqable — the
// match happens BEFORE any fetch() to Booqable, not as a post-hoc filter.
// -----------------------------------------------------------------------------

interface AllowlistEntry {
  /** Stable id, useful for logging/debugging which rule matched. */
  id: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Matches the Booqable-relative path, e.g. "orders/123/fulfillments/book". */
  pattern: RegExp
  /** JSON:API resource type this path operates on, used for money-field masking and sync_log.entity. */
  entity: string
  /** What this operation is and what guards it, restated from spec §11 for anyone reading this file cold. */
  description: string
}

/**
 * Fact #1 CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#orders-statuses):
 * order status enum is new | draft | reserved | started | stopped |
 * archived | canceled — "draft" replaced the assumed "concept" (v1
 * APIs/webhooks still return "concept") and "canceled" was missing. Only
 * new/draft/reserved are writable, at creation; documented transitions run
 * through the OrderStatusTransition resource (new→draft→reserved,
 * stopped→archived) and the OrderFulfillment resource (reserved→started,
 * started→stopped). STILL UNCONFIRMED: the exact v4 URL shape for those
 * transition calls — the three fulfillment action paths below
 * (book/start/stop) remain a placeholder guess pending endpoint-level
 * verification; named here, not inlined three times in
 * WRITEBACK_ALLOWLIST, so the correction touches one place.
 */
const BOOQABLE_ORDER_STATUS = {
  new: 'new',
  draft: 'draft',
  reserved: 'reserved',
  started: 'started',
  stopped: 'stopped',
  archived: 'archived',
  canceled: 'canceled',
} as const

const BOOQABLE_FULFILLMENT_ACTION_PATH = {
  book: (orderId: string) => `orders/${orderId}/fulfillments/book`,
  start: (orderId: string) => `orders/${orderId}/fulfillments/start`,
  stop: (orderId: string) => `orders/${orderId}/fulfillments/stop`,
} as const

/**
 * Law 17: this integration's own vocabulary says CLIENT everywhere, but
 * Booqable's own REST resource for this entity is spelled with the one word
 * every file here other than src/lib/booqable/types.ts is forbidden from
 * using, and the raw HTTP path cannot be renamed and still reach their API.
 * BOOQABLE_CLIENT_RESOURCE_NAME (imported above, aliased from types.ts's own
 * Law 17 exception) is the only place that spelling reaches this file, kept
 * out of the allowlist ids/entities/descriptions below and the path-matching
 * logic — every one of those says "client" throughout — and
 * toBooqablePath() (below) is the ONE place the translation happens.
 *
 * Translates this proxy's own path vocabulary into Booqable's wire-format
 * URL. The only translation needed today: our "clients" resource maps to
 * BOOQABLE_CLIENT_RESOURCE_NAME above (Law 17). Every other resource name in
 * ALLOWLIST already matches Booqable's own naming verbatim (orders,
 * products, payments, ...), so this is a one-entry map, not a general
 * rewrite engine.
 */
function toBooqablePath(path: string): string {
  if (path === 'clients') return BOOQABLE_CLIENT_RESOURCE_NAME
  if (path.startsWith('clients/')) return `${BOOQABLE_CLIENT_RESOURCE_NAME}/${path.slice('clients/'.length)}`
  return path
}

/**
 * The six write-back operations, and ONLY these six — spec §11. Every push
 * goes through this allowlist; idempotency_key reuses the Law 9 client UUID
 * (see the Idempotency-Key handling in callBooqable, below); a failed push
 * does not roll back the local row (sync_outbox status is the source of
 * truth for "did Booqable hear about it," the local row is the source of
 * truth for "what staff did" — they stay independently queryable).
 *
 * The guards named in each description (duplicate check, Law 10 discount
 * gate, availability check, workspace sign-off) are enforced by the CALLER
 * building the request (src/actions/*, not yet written) before it ever
 * reaches this function — this proxy's allowlist match confirms the
 * operation is one of the six permitted shapes, it does not re-derive
 * whether the specific guard condition was satisfied. That business logic
 * living outside this file, in src/lib/booqable/ and src/actions/, is Law 1.
 */
const WRITEBACK_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    id: 'create_client',
    method: 'POST',
    pattern: /^clients$/,
    entity: 'clients',
    description:
      'Create client -> POST clients (Booqable: BOOQABLE_CLIENT_RESOURCE_NAME). Guarded by a duplicate check against external_refs by email + phone before enqueueing.',
  },
  {
    id: 'update_client_contact',
    method: 'PATCH',
    pattern: /^clients\/[^/]+$/,
    entity: 'clients',
    description:
      'Update client contact -> PATCH clients/:id (Booqable: BOOQABLE_CLIENT_RESOURCE_NAME/:id). Only Booqable-mastered fields (spec §5.1) may be sent — never an OS-only field like membership tier, credit terms, or standing discount.',
  },
  {
    id: 'create_order',
    method: 'POST',
    pattern: /^orders$/,
    entity: 'orders',
    description:
      'Create order -> POST orders (+ lines). Guarded by: Law 10 discount gate already passed, availability already checked locally, days >= 1.',
  },
  {
    id: 'order_book',
    method: 'POST',
    pattern: /^orders\/[^/]+\/fulfillments\/book$/,
    entity: 'orders',
    description: `Order status -> ${BOOQABLE_ORDER_STATUS.reserved} via fulfillment book call. Guarded by: booking complete and has lines.`,
  },
  {
    id: 'order_start',
    method: 'POST',
    pattern: /^orders\/[^/]+\/fulfillments\/start$/,
    entity: 'orders',
    description: `Order status -> ${BOOQABLE_ORDER_STATUS.started} via fulfillment start call. Guarded by: handover workspace signed off.`,
  },
  {
    id: 'order_stop',
    method: 'POST',
    pattern: /^orders\/[^/]+\/fulfillments\/stop$/,
    entity: 'orders',
    description: `Order status -> ${BOOQABLE_ORDER_STATUS.stopped} via fulfillment stop call. Guarded by: return workspace signed off.`,
  },
]

/** Builds a {collection, item} regex pair for a simple top-level resource, to avoid repeating the same four lines nine times below. */
function resourcePaths(name: string): [RegExp, RegExp] {
  const escaped = name.replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&')
  return [new RegExp(`^${escaped}$`), new RegExp(`^${escaped}/[^/]+$`)]
}

/**
 * Read paths the P1-P2 build phases need, per instructions: products,
 * product_groups, stock_items, barcodes, bundles, collections, locations,
 * tax_rates, clients (Booqable: BOOQABLE_CLIENT_RESOURCE_NAME), orders
 * (+ lines + fulfillments), plannings, documents, payments. GET only —
 * nothing here is a write path.
 *
 * Fact #5 CONFIRMED 10 Aug 2026: v4 pagination is JSON:API
 * page[number]/page[size] on every list endpoint, no cursor exists, and
 * responses carry links.self/first/last only (no links.next). Nothing to
 * change here — this proxy already forwards the caller's query string
 * unmodified to Booqable (see callBooqable's query-string handling), which
 * is exactly right for the confirmed shape.
 *
 * Fact #6 PARTIALLY CONFIRMED 10 Aug 2026: archiving IS v4's only delete
 * (DELETE /customers/{id} and /products/{id} are documented as "Archive
 * a …" and return the full record with archived:true; orders archive via a
 * status transition and have no DELETE). List filters filter[archived] /
 * filter[archived_at] (customers, products) and filter[status] (orders)
 * exist for including/excluding archived records explicitly. STILL OPEN:
 * whether GET by id returns 200 after archive (implied, not stated). This
 * proxy still does not filter archived records either way; it forwards the
 * request and response as-is.
 */
const READ_ALLOWLIST: readonly AllowlistEntry[] = ([
  'products',
  'product_groups',
  'stock_items',
  'barcodes',
  'bundles',
  // Added 10 Aug 2026 after a live audit of what `sync.ts` actually
  // requests vs what this list allowed. `matchAllowlist` 403s an unlisted
  // path BEFORE it reaches Booqable, so these three were failing every
  // pull silently-by-design: `pullBundles` fetches `/bundle_items` for
  // bundle composition, `pullPayments` fetches `/payment_methods` to
  // resolve the SECURITY DEPOSIT method name (the Law 5 classifier's
  // SECONDARY signal — without it that signal can never fire), and the
  // availability mapper fetches `/availabilities`. Absent from the
  // original list because it was written from the spec's §3.1 resource
  // families rather than from the call sites; the mismatch could not
  // surface earlier because nothing has ever run against a live account.
  'bundle_items',
  'payment_methods',
  'availabilities',
  'collections',
  'locations',
  'tax_rates',
  'clients',
  'plannings',
  'documents',
  'payments',
].flatMap((name) => {
  const [collection, item] = resourcePaths(name)
  return [
    { id: `read_${name}_collection`, method: 'GET', pattern: collection, entity: name, description: `Read ${name} collection.` },
    { id: `read_${name}_item`, method: 'GET', pattern: item, entity: name, description: `Read a single ${name} record.` },
  ] satisfies AllowlistEntry[]
}) as AllowlistEntry[]).concat([
  { id: 'read_orders_collection', method: 'GET', pattern: /^orders$/, entity: 'orders', description: 'Read orders collection.' },
  { id: 'read_orders_item', method: 'GET', pattern: /^orders\/[^/]+$/, entity: 'orders', description: 'Read a single order.' },
  { id: 'read_order_lines', method: 'GET', pattern: /^orders\/[^/]+\/lines$/, entity: 'order_lines', description: "Read an order's lines." },
  {
    id: 'read_order_fulfillments',
    method: 'GET',
    pattern: /^orders\/[^/]+\/fulfillments$/,
    entity: 'fulfillments',
    description: "Read an order's fulfillments.",
  },
])

const ALLOWLIST: readonly AllowlistEntry[] = [...WRITEBACK_ALLOWLIST, ...READ_ALLOWLIST]

function matchAllowlist(method: string, path: string): AllowlistEntry | null {
  for (const entry of ALLOWLIST) {
    if (entry.method === method && entry.pattern.test(path)) return entry
  }
  return null
}

// -----------------------------------------------------------------------------
// 3 · Law 6 money-stripping — literal list of which JSON:API attribute paths
//     count as money per resource type, nulled in place for money-blind
//     roles. Never delete the key: this is a pass-through JSON:API reshape,
//     not a masking view, so a null value (not an absent key) is the
//     documented approach.
//
//     Field names below are our best-effort mapping, not one of the six
//     enumerated unconfirmed facts, but still provisional pending schema
//     confirmation against a live Booqable v4 account — corrected in one
//     place (this map) if wrong.
// -----------------------------------------------------------------------------

/**
 * Fact #4 CONFIRMED 10 Aug 2026 (https://developers.booqable.com/#payments,
 * #orders, #lines, #deposit-holds): a deposit is a monetary DIMENSION, not
 * a kind — every payment record (payment_charges / payment_authorizations
 * / payment_refunds) carries amount_in_cents + deposit_in_cents +
 * total_in_cents (= amount + deposit); orders carry deposit_type/
 * deposit_value plus six deposit_*_in_cents tracking fields; the
 * deposit-shaped LINE kind is `deposit_charge` (generated by a deposit
 * hold). There is no payment "kind" attribute — the old guessed
 * paymentKindField masking branch is gone; the deposit money on a payment
 * is masked by listing deposit_in_cents/total_in_cents as ordinary money
 * fields below. `deposit` is kept in lineTypeValues defensively for
 * v1-flavoured payloads (cf. draft/concept renames).
 */
const DEPOSIT_RULE = {
  orderFields: [
    'deposit_in_cents',
    'deposit_value',
    'deposit_paid_in_cents',
    'deposit_to_be_paid_in_cents',
    'deposit_held_in_cents',
    'deposit_refunded_in_cents',
    'deposit_to_refund_in_cents',
  ],
  lineTypeValues: ['deposit', 'deposit_charge'],
} as const

const MONEY_FIELD_PATHS: Readonly<Record<string, readonly string[]>> = {
  orders: [
    // docs Orders Fields, 10 Aug 2026 — documented money fields:
    'price_in_cents',
    'grand_total_in_cents',
    'grand_total_with_tax_in_cents',
    'total_in_cents',
    'to_be_paid_in_cents',
    'amount_in_cents',
    'amount_paid_in_cents',
    'amount_to_be_paid_in_cents',
    'paid_in_cents',
    'total_paid_in_cents',
    'tax_in_cents',
    'discount_in_cents',
    'discount_value',
    'total_discount_in_cents',
    'coupon_discount_in_cents',
    // legacy guessed names kept — nulled only if present, harmless if absent:
    'subtotal_in_cents',
    'due_in_cents',
    ...DEPOSIT_RULE.orderFields,
  ],
  order_lines: ['price_in_cents', 'total_in_cents', 'tax_in_cents', 'discount_in_cents'],
  // docs: the product price attribute is base_price_in_cents; price_in_cents
  // kept defensively for group/legacy payloads.
  products: ['price_in_cents', 'base_price_in_cents', 'default_purchase_cost_in_cents', 'deposit_in_cents'],
  product_groups: ['price_in_cents', 'base_price_in_cents', 'default_purchase_cost_in_cents', 'deposit_in_cents'],
  bundles: ['price_in_cents', 'base_price_in_cents'],
  // Payments are polymorphic (fact #4): every subtype carries the
  // amount/deposit/total split, charges add refunded/refundable mirrors,
  // authorizations add capturable/captured/released mirrors — all money.
  payments: [
    'amount_in_cents',
    'deposit_in_cents',
    'total_in_cents',
    'amount',
    'amount_refundable_in_cents',
    'amount_refunded_in_cents',
    'deposit_refundable_in_cents',
    'deposit_refunded_in_cents',
    'total_refundable_in_cents',
    'total_refunded_in_cents',
    'amount_capturable_in_cents',
    'deposit_capturable_in_cents',
    'total_capturable_in_cents',
    'amount_captured_in_cents',
    'deposit_captured_in_cents',
    'total_captured_in_cents',
    'amount_released_in_cents',
    'deposit_released_in_cents',
    'total_released_in_cents',
  ],
  documents: ['total_in_cents', 'grand_total_in_cents'],
}

// The polymorphic payment resource type strings (fact #4) — the masking
// walk matches on the JSON:API resource `type`, which for payments is one
// of these three, never the literal "payments".
const PAYMENT_RESOURCE_TYPES = ['payment_charges', 'payment_authorizations', 'payment_refunds'] as const

/**
 * Nulls money attribute keys in place, on both the primary `data` member and
 * any JSON:API `included` side-loaded resources, for money-blind roles.
 * No-op (returns body untouched) for a role that can view money.
 */
function stripMoneyForRole(body: unknown, role: SystemRole): unknown {
  if (canViewMoney(role)) return body
  if (!body || typeof body !== 'object') return body

  const doc = body as Record<string, unknown>

  const stripResource = (resource: unknown): void => {
    if (!resource || typeof resource !== 'object') return
    const r = resource as Record<string, unknown>
    const type = typeof r['type'] === 'string' ? (r['type'] as string) : undefined
    const attributes = r['attributes']
    if (!type || !attributes || typeof attributes !== 'object') return
    const attrs = attributes as Record<string, unknown>
    // Payments are polymorphic (fact #4, CONFIRMED): the JSON:API resource
    // type is payment_charges/payment_authorizations/payment_refunds, never
    // a literal "payments" — route all three to the payments money list.
    const isPaymentType = (PAYMENT_RESOURCE_TYPES as readonly string[]).includes(type)
    const moneyFields = isPaymentType ? MONEY_FIELD_PATHS['payments'] : MONEY_FIELD_PATHS[type]
    if (!moneyFields) return
    for (const field of moneyFields) {
      if (field in attrs) attrs[field] = null // null in place — never delete the key
    }
    // Lines carrying a deposit-shaped kind ('deposit_charge' per the
    // documented Lines enum; bare 'deposit' kept defensively): null the
    // shared price fields regardless of resource-type match above. The kind
    // attribute is checked under both plausible spellings.
    if (type === 'order_lines' || type === 'lines') {
      const lineKind = attrs['line_type'] ?? attrs['type']
      if (typeof lineKind === 'string' && (DEPOSIT_RULE.lineTypeValues as readonly string[]).includes(lineKind)) {
        for (const field of ['price_in_cents', 'total_in_cents']) {
          if (field in attrs) attrs[field] = null
        }
      }
    }
  }

  const data = doc['data']
  if (Array.isArray(data)) data.forEach(stripResource)
  else stripResource(data)

  const included = doc['included']
  if (Array.isArray(included)) included.forEach(stripResource)

  return doc
}

// -----------------------------------------------------------------------------
// 4 · Token-bucket rate limiting + exponential backoff with jitter on 429.
//
// Fact #2 — re-verified 10 Aug 2026 and STILL UNCONFIRMED, now known to be
// genuinely undocumented: the entire v4 reference documents rate limiting
// only as the 429 error entry ("Too Many Requests -- You're doing too many
// requests! Slow down!"). No numeric limits, no scope (token/account/IP),
// no X-RateLimit-* headers, and no Retry-After guarantee exist anywhere in
// the docs (v1 has nothing either). So: the bucket size/refill rate below
// stays a conservative placeholder (named constants, one-line change once
// real numbers are learned — from Booqable support or by logging all
// response headers on the first real 429 in staging), and the backoff loop
// treats Retry-After as OPTIONAL — honored if present (see backoffDelayMs),
// exponential backoff with jitter otherwise. It reacts to a real 429
// regardless of whether the local bucket predicted it.
// -----------------------------------------------------------------------------

const RATE_LIMIT = {
  bucketCapacity: 10,
  refillPerSecond: 5,
} as const

const BACKOFF = {
  maxAttempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
} as const

// Module-level state persists across warm invocations of the same isolate,
// best-effort only — not a substitute for a real distributed limiter, and
// not claimed to be one. Good enough to avoid hammering Booqable from a
// single warm function instance.
let bucketTokens = RATE_LIMIT.bucketCapacity
let lastRefillAt = Date.now()

function takeToken(): boolean {
  const now = Date.now()
  const elapsedSeconds = (now - lastRefillAt) / 1000
  bucketTokens = Math.min(RATE_LIMIT.bucketCapacity, bucketTokens + elapsedSeconds * RATE_LIMIT.refillPerSecond)
  lastRefillAt = now
  if (bucketTokens >= 1) {
    bucketTokens -= 1
    return true
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForToken(): Promise<void> {
  while (!takeToken()) {
    await sleep(50)
  }
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, BACKOFF.maxDelayMs)
  }
  const exponential = BACKOFF.baseDelayMs * 2 ** (attempt - 1)
  const jitter = Math.random() * BACKOFF.baseDelayMs
  return Math.min(exponential + jitter, BACKOFF.maxDelayMs)
}

interface BooqableCallResult {
  response: Response
  attempts: number
  /** Set only when every attempt was exhausted against repeated 429s. */
  exhausted: boolean
}

/**
 * Forwards one request to Booqable, honoring the token bucket and retrying
 * ONLY on HTTP 429 with exponential backoff + jitter, up to BACKOFF.maxAttempts.
 * Any other status (2xx, 4xx other than 429, 5xx) is returned immediately —
 * this is not a general-purpose retrier, only a 429-aware one, per spec.
 */
async function callBooqable(url: string, init: RequestInit): Promise<BooqableCallResult> {
  let lastResponse: Response | null = null
  for (let attempt = 1; attempt <= BACKOFF.maxAttempts; attempt++) {
    await waitForToken()
    const response = await fetch(url, init)
    if (response.status !== 429) {
      return { response, attempts: attempt, exhausted: false }
    }
    lastResponse = response
    if (attempt < BACKOFF.maxAttempts) {
      const delay = backoffDelayMs(attempt, response.headers.get('Retry-After'))
      // Drain the body of the response we're discarding so the connection can be reused.
      await response.body?.cancel().catch(() => {})
      await sleep(delay)
    }
  }
  // Exhausted all attempts against repeated 429s — surface the last 429 response as the failure.
  return { response: lastResponse as Response, attempts: BACKOFF.maxAttempts, exhausted: true }
}

// -----------------------------------------------------------------------------
// 5 · sha256 payload hashing — the payload BODY is never logged, only its
//     hash, per instructions.
// -----------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// -----------------------------------------------------------------------------
// 6 · Caller verification + role resolution.
//
// Step 1 (verifyCaller): validates the Authorization header against Supabase
// Auth using a service-role client — never the anon key, this function needs
// service-role for both this lookup and the sync_log/users reads below,
// unlike src/lib/supabase.ts in the browser bundle, which must stay
// anon-key-only forever.
//
// Step 2 (resolveCallerRole): mirrors auth_user_role() EXACTLY as it reads
// today (migrations 0011, restated 0014, retargeted at users.primary_role) —
// `select primary_role from users where id = :caller_id`, falling back to
// 'Client' when no row is found, the same coalesce-to-Client direction the DB
// function uses (0014's restatement of the fallback, kept current through
// 0017-reopen/0018/0020). This function runs with the service-role client, so
// it does not depend on 0020's `users_select_own` RLS policy (that policy
// exists for the browser's own anon/authenticated-role session to resolve its
// own role client-side; this server-side check bypasses RLS by service-role
// design and reads the same row directly) — the point of doing the lookup
// this way is that the proxy's server-side role check can never disagree
// with what the database's own RLS would compute for the same user id.
// -----------------------------------------------------------------------------

interface CallerIdentity {
  userId: string
  role: SystemRole
}

async function verifyCaller(admin: SupabaseClient, authHeader: string | null): Promise<{ userId: string } | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null
  const jwt = authHeader.slice('bearer '.length).trim()
  if (!jwt) return null

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user) return null
  return { userId: data.user.id }
}

async function resolveCallerRole(admin: SupabaseClient, userId: string): Promise<SystemRole> {
  const { data, error } = await admin.from('users').select('primary_role').eq('id', userId).maybeSingle()
  if (error || !data?.primary_role) {
    // Same fallback direction as auth_user_role()'s own coalesce (0014):
    // an unresolved role is treated as the external, most-restricted role,
    // never silently upgraded to a staff role.
    return 'Client'
  }
  return data.primary_role as SystemRole
}

async function identifyCaller(admin: SupabaseClient, authHeader: string | null): Promise<CallerIdentity | null> {
  const verified = await verifyCaller(admin, authHeader)
  if (!verified) return null
  const role = await resolveCallerRole(admin, verified.userId)
  return { userId: verified.userId, role }
}

// -----------------------------------------------------------------------------
// 7 · sync_log — every call to this function is logged, success or rejection.
//     The payload BODY is never written, only its sha256 hash.
// -----------------------------------------------------------------------------

interface LogParams {
  admin: SupabaseClient
  direction: 'pull' | 'push'
  path: string
  method: string
  httpStatus: number | null
  durationMs: number
  entity: string | null
  externalId: string | null
  actor: string | null
  payloadHash: string | null
  error: string | null
}

async function logCall(params: LogParams): Promise<void> {
  const { admin, ...row } = params
  try {
    await admin.from('sync_log').insert({
      direction: row.direction,
      path: row.path,
      method: row.method,
      http_status: row.httpStatus,
      duration_ms: row.durationMs,
      entity: row.entity,
      external_id: row.externalId,
      actor: row.actor,
      payload_hash: row.payloadHash,
      error: row.error,
    })
  } catch {
    // Logging must never take down the response path. A failed sync_log
    // write is itself worth knowing about eventually, but not at the cost
    // of failing the caller's actual request over an observability write.
  }
}

/** Best-effort entity/external_id extraction from a Booqable-relative path, for sync_log. Falls back to the allowlist entry's declared entity when a firmer match isn't available. */
function parsePathForLog(path: string, matched: AllowlistEntry | null): { entity: string | null; externalId: string | null } {
  const segments = path.split('/').filter(Boolean)
  const entity = matched?.entity ?? segments[0] ?? null
  const second = segments[1]
  // A second segment that isn't a known sub-resource keyword is treated as an id.
  const looksLikeSubResource = second === 'lines' || second === 'fulfillments'
  const externalId = second && !looksLikeSubResource ? second : null
  return { entity, externalId }
}

// -----------------------------------------------------------------------------
// 8 · CORS — the browser calls this function cross-origin from the Vite app.
// -----------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(extraHeaders ?? {}) },
  })
}

// -----------------------------------------------------------------------------
// 8b · The response envelope (BooqableProxyEnvelope in src/lib/booqable/client.ts).
//
// EVERY return path from the main handler below answers the *Supabase
// Functions* call with HTTP 200 and this shape, carrying the real status
// inside `status` — whether that status came from Booqable or from one of
// this function's own rejections (401/403/500/502).
//
// Why HTTP 200 on a rejection: supabase-js turns any non-2xx function
// response into a `FunctionsHttpError` whose body the caller has to re-read
// asynchronously off `error.context`. That collapses "Booqable said 429" and
// "the relay never reached the function" into one indistinguishable failure,
// and client.ts needs them apart — it retries a Booqable 429/5xx on
// Booqable's real status and surfaces a 403 allowlist miss immediately.
// Keeping the transport at 200 is what preserves that separation.
//
// A non-JSON upstream body is carried through as a plain string in `body`.
// -----------------------------------------------------------------------------

function envelopeResponse(status: number, ok: boolean, body: unknown, proxyError?: string): Response {
  return jsonResponse(
    proxyError === undefined ? { status, ok, body } : { status, ok, body, proxyError },
    200,
    CORS_HEADERS,
  )
}

// -----------------------------------------------------------------------------
// 9 · Main handler — orchestrates all five responsibilities in order.
// -----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const startedAt = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Config sanity: fail loudly (500), never silently forward without a
  // token, and never echo the missing-secret name's *value* — only that a
  // named secret is unset.
  if (!BOOQABLE_TOKEN || !BOOQABLE_SLUG || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return envelopeResponse(500, false, null, 'Edge Function is missing required environment configuration.')
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const url = new URL(req.url)
  let path = url.pathname
  const prefixIdx = path.indexOf(`/${FUNCTION_NAME}`)
  if (prefixIdx !== -1) path = path.slice(prefixIdx + FUNCTION_NAME.length + 1)
  path = path.replace(/^\/+/, '').replace(/\/+$/, '')

  const method = req.method.toUpperCase()
  const direction: 'pull' | 'push' = method === 'GET' ? 'pull' : 'push'

  // Read the raw body ONCE (need it both to forward, and to hash for the
  // log). Never parsed-then-reserialized — forwarded byte-for-byte so we
  // never accidentally change what Booqable receives.
  const rawBody = method === 'GET' || method === 'DELETE' ? null : await req.text()
  const payloadHash = rawBody ? await sha256Hex(rawBody) : null

  let httpStatus: number | null = null
  let logError: string | null = null
  let actor: string | null = null
  let matched: AllowlistEntry | null = null

  try {
    // --- Step 1: verify JWT, Step 2: resolve role -------------------------
    const caller = await identifyCaller(admin, req.headers.get('Authorization'))
    if (!caller) {
      httpStatus = 401
      logError = 'unauthenticated'
      return envelopeResponse(401, false, null, 'Unauthenticated.')
    }
    actor = caller.userId

    // --- Step 3: path + method allowlist -----------------------------------
    matched = matchAllowlist(method, path)
    if (!matched) {
      httpStatus = 403
      logError = 'not allowlisted'
      return envelopeResponse(403, false, null, 'This path/method is not permitted.')
    }

    // --- Step 5a: forward to Booqable, rate-limited with 429 backoff -------
    // toBooqablePath translates our "clients" path vocabulary into
    // Booqable's actual wire-format resource name (Law 17) — every other
    // path passes through unchanged.
    const booqableUrl = `${BOOQABLE_API_BASE(BOOQABLE_SLUG)}/${toBooqablePath(path)}${url.search}`
    const forwardHeaders: Record<string, string> = {
      Authorization: `Bearer ${BOOQABLE_TOKEN}`,
      Accept: 'application/json',
    }
    if (rawBody !== null) {
      forwardHeaders['Content-Type'] = req.headers.get('Content-Type') ?? 'application/json'
    }
    // Law 9: every write carries a client UUID, reused as the Booqable
    // idempotency key — never a freshly minted one. This proxy does not
    // mint or enforce uniqueness of that key itself (sync_outbox's unique
    // constraint on idempotency_key, migration 0040, is where duplicates
    // are actually rejected when writes are queued through the outbox);
    // for a write forwarded directly through this proxy, the caller's
    // Idempotency-Key header is passed through verbatim, unmodified.
    const incomingIdempotencyKey = req.headers.get('Idempotency-Key')
    if (incomingIdempotencyKey) forwardHeaders['Idempotency-Key'] = incomingIdempotencyKey

    const { response: booqableResponse, exhausted } = await callBooqable(booqableUrl, {
      method,
      headers: forwardHeaders,
      body: rawBody,
    })

    httpStatus = booqableResponse.status
    if (exhausted) {
      logError = 'exhausted retries on repeated 429'
    }

    // --- Step 4: strip money fields for money-blind roles (Law 6) ---------
    const contentType = booqableResponse.headers.get('Content-Type') ?? ''
    let responseBody: unknown
    let isJson = false
    if (contentType.includes('json')) {
      isJson = true
      try {
        responseBody = await booqableResponse.json()
      } catch {
        responseBody = null
        isJson = false
      }
    } else {
      responseBody = await booqableResponse.text()
    }

    const finalBody = isJson ? stripMoneyForRole(responseBody, caller.role) : responseBody

    // Booqable's own status/ok travel INSIDE the envelope (section 8b); the
    // Supabase Functions response itself is 200 so supabase-js hands the
    // caller a parsed body instead of a FunctionsHttpError. A non-JSON
    // upstream body rides along as a string in `body`.
    return envelopeResponse(booqableResponse.status, booqableResponse.ok, finalBody)
  } catch (err) {
    httpStatus = httpStatus ?? 502
    // Never include BOOQABLE_TOKEN or any secret value in a logged/returned
    // error message — only the error's own message text.
    logError = err instanceof Error ? err.message : 'unknown proxy error'
    return envelopeResponse(502, false, null, 'Upstream request failed.')
  } finally {
    // --- Step 5b: log every call, regardless of outcome --------------------
    const { entity, externalId } = parsePathForLog(path, matched)
    await logCall({
      admin,
      direction,
      path,
      method,
      httpStatus,
      durationMs: Date.now() - startedAt,
      entity,
      externalId,
      actor,
      payloadHash,
      error: logError,
    })
  }
})

// =============================================================================
// NOTE — sync_outbox draining
//
// The architecture (spec §4) states mirror tables feed sync_outbox, "which
// booqable-proxy drains back out to Booqable." This file implements the
// live browser-facing proxy path (the five responsibilities above); it does
// NOT currently poll or drain sync_outbox itself, and nothing invokes it on
// a schedule for that purpose.
//
// TODO(decision): draining sync_outbox needs a scheduled trigger — pg_cron
// calling a processing Edge Function (this one, invoked with no browser
// caller and a service-role-only code path, or a separate function that
// reuses matchAllowlist/callBooqable/logCall from here), or some other
// scheduler. Not invented here, same reasoning booqable-webhook's own
// inbox-processing note (spec §12 item 3) gives: a scheduler is a real
// infrastructure decision, not something to guess into place alongside a
// scaffold pass.
// =============================================================================
