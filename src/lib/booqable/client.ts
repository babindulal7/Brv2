import { supabase } from '../supabase'
import type {
  BooqableId,
  BooqableIncludedResource,
  BooqableLinks,
  BooqablePageMeta,
  BooqableRelationship,
  BooqableResource,
  BooqableResourceIdentifier,
  BooqableListResponse,
  BooqableSingleResponse,
} from './types'

/**
 * Fetch wrapper for the Booqable integration.
 *
 * SPEC_ARCH — this file NEVER calls Booqable directly and NEVER holds a
 * Booqable token. Every call goes through the `booqable-proxy` Supabase
 * Edge Function (a separate file, not written in this pass), which is the
 * only place `BOOQABLE_TOKEN` / `BOOQABLE_SLUG` are read
 * (`Deno.env.get`, never a `VITE_`-prefixed variable, never anything under
 * `src/`). The browser only ever holds a Supabase session JWT, attached
 * below the same way every other authenticated call in this codebase
 * attaches one.
 *
 * ## Contract with `supabase/functions/booqable-proxy`
 *
 * The proxy is expected to always answer the *Supabase Functions* call
 * with HTTP 200 and the `BooqableProxyEnvelope` shape below — carrying
 * Booqable's own response status *inside* the envelope's `status` field —
 * regardless of what Booqable itself returned. That keeps supabase-js's own
 * transport-level errors (`FunctionsHttpError` / `FunctionsRelayError` /
 * `FunctionsFetchError`, thrown only for a genuine relay/network failure or
 * an uncaught exception inside the function) cleanly separated from a
 * Booqable-side 429/5xx/4xx, which this file needs to inspect and retry on
 * using Booqable's real status code, not a status mangled by the transport.
 * `booqable-proxy` honours this envelope on every return path — Booqable
 * success/failure and its own 401/403/500/502 rejections alike — through
 * the single `envelopeResponse` helper in section 8b of
 * `supabase/functions/booqable-proxy/index.ts`.
 *
 * The *request* half of that contract is the mirror image: the proxy routes
 * on the HTTP request itself — Booqable-relative path from `url.pathname`,
 * method from `req.method`, query forwarded verbatim from `url.search`, and
 * the raw body forwarded byte-for-byte as Booqable's own payload. It does
 * NOT read a `{ path, method, query }` JSON envelope. `buildProxyInvokePath`
 * below is what puts path + query where the proxy actually looks.
 *
 * ## Auth
 *
 * `@supabase/functions-js`'s `FunctionsClient` already attaches the
 * signed-in session's JWT as the `Authorization` header on every
 * `supabase.functions.invoke()` call automatically (verified against
 * `node_modules/@supabase/functions-js` — "supabase-js automatically passes
 * the `Authorization` header with the signed in user's JWT"). This file
 * does not re-attach it by hand; `assertAuthenticated` below exists only to
 * fail fast, client-side, with a clear message when there is no session at
 * all, instead of silently sending a call the proxy will reject with 401
 * anyway (SPEC_ARCH proxy responsibility 1).
 */

/* ── constants ──────────────────────────────────────────────────────────
 * Named, not inlined — the retry ceiling here MUST match the proxy's own
 * ceiling (SPEC_ARCH proxy responsibility 5), so the two layers agree on
 * when a failure is finally surfaced instead of silently retried forever
 * by one layer while the other has already given up. */

const BOOQABLE_PROXY_FUNCTION_NAME = 'booqable-proxy'

/** Matches the proxy's own retry ceiling (SPEC_ARCH item 5).
 *
 * Rate limits (UNCONFIRMED_BOOQABLE_FACTS[2], re-verified 10 Aug 2026):
 * Booqable's docs document ONLY the 429 status code itself ("You're doing
 * too many requests! Slow down!") — no numeric limits, no X-RateLimit-*
 * headers, and no Retry-After guarantee. The retry logic here therefore
 * depends on NOTHING beyond the status code: exponential backoff with
 * jitter, never a required header. (Header-aware backoff lives in the
 * proxy, which reads Retry-After opportunistically IF present.) */
export const MAX_RETRY_ATTEMPTS = 5

/**
 * CONFIRMED 10 Aug 2026 — UNCONFIRMED_BOOQABLE_FACTS[5] (see `types.ts`).
 * v4 uses JSON:API `page[number]` / `page[size]` on every list endpoint
 * ("The page to request." / "The amount of items per page." —
 * https://developers.booqable.com/#orders-list-orders Request params; the
 * same pair appears on every list endpoint). No `page/per`, no
 * limit/offset, no cursor exists anywhere in the v4 reference, so the old
 * two-candidate flag collapsed to the one documented style.
 *
 * Stop condition for any pagination loop over these params: v4 responses
 * carry links.self/first/last ONLY — there is NO links.next — so stop when
 * a page comes back short (`records.length < page[size]`) or empty, or
 * precompute totals via the opt-in `?stats[total]=count` →
 * `meta.stats.total.count`. Default page size 25 is implied by doc examples
 * only and the MAXIMUM size is undocumented — always pass page[size]
 * explicitly and don't assume sizes above 25 are safe without testing.
 */
export type BooqablePaginationStyle = 'jsonapi-page-number'
export const BOOQABLE_PAGINATION_STYLE: BooqablePaginationStyle = 'jsonapi-page-number'

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504])

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || (status >= 500 && status <= 599)
}

/** Exponential backoff with jitter. attemptIndex is 0-based (0 = the delay before the 2nd try). */
function backoffDelayMs(attemptIndex: number): number {
  const base = 300 * 2 ** attemptIndex
  const jitter = Math.random() * base * 0.5
  return base + jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ── request / response envelope ───────────────────────────────────────── */

export type BooqableHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** A write that returns a single composed resource — DELETE is handled separately by `booqableDelete` since it has no body to parse. */
export type BooqableWriteMethod = 'POST' | 'PATCH' | 'PUT'

export interface BooqableRequestOptions {
  /** Booqable API path, relative to `/api/4` — e.g. `/orders` or `/orders/123`. */
  path: string
  method: BooqableHttpMethod
  // `| undefined` spelled out on every optional field below, not left
  // implicit — under `exactOptionalPropertyTypes`, `foo?: X` means "if
  // present, exactly X", which rejects passing a variable typed `X |
  // undefined` (e.g. another optional param forwarded as-is) into an
  // object literal for this field. `foo?: X | undefined` is the documented
  // opt back in to the pre-4.4 "present-but-undefined is fine" behaviour.
  query?: Record<string, string | number | boolean | undefined> | undefined
  body?: unknown
  /**
   * Law 9 — every outbound write reuses the SAME `client_uuid` the local
   * mutation was already queued under (`offlineQueue.ts` / `dataAccess.ts`),
   * never a freshly generated one here. This file never calls
   * `crypto.randomUUID()` / `newClientUuid()` itself for this purpose —
   * "do not invent a second key" per PLAN.md §0 law 9.
   *
   * Transported to the proxy as the `Idempotency-Key` request header —
   * that is the one place `booqable-proxy` reads it from
   * (`req.headers.get('Idempotency-Key')`, forwarded verbatim to Booqable;
   * the header is already listed in the proxy's CORS
   * `Access-Control-Allow-Headers` so the preflight passes).
   *
   * TODO(decision) — the exact Booqable-side idempotency mechanism (header
   * name, or a query/body param) that `idempotencyKey` should be turned
   * into is unconfirmed against live docs. This is a *separate* uncertainty
   * from the six enumerated in `UNCONFIRMED_BOOQABLE_FACTS` (`types.ts`) —
   * flagged here rather than folded into that list because it is about
   * Booqable's write-idempotency contract, not one of the six read-shape
   * facts the spec names. `booqable-proxy` (a separate file) owns turning
   * this value into whatever Booqable actually expects, once confirmed.
   */
  idempotencyKey?: string | undefined
}

/**
 * The proxy's response envelope. See the file header for why `status`
 * carries Booqable's real status while the Supabase Functions call itself
 * is always 200.
 */
export interface BooqableProxyEnvelope {
  status: number
  ok: boolean
  body: unknown
  /** Present when the proxy itself rejected the call — allowlist miss (403), auth failure (401) — before ever reaching Booqable. */
  proxyError?: string
}

export class BooqableProxyError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'BooqableProxyError'
    this.status = status
    this.body = body
  }
}

async function assertAuthenticated(): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new BooqableProxyError(
      'No authenticated Supabase session — sign in before calling the Booqable proxy.',
      401,
      null,
    )
  }
}

/**
 * Builds the first argument to `supabase.functions.invoke()`: the function
 * name, the Booqable-relative path, and the serialized query — everything
 * carried in the URL, because the URL is the only part of the request
 * `booqable-proxy` routes on.
 *
 * `FunctionsClient.invoke` builds its target as
 * `new URL(`${functionsUrl}/${functionName}`)` (verified against
 * `node_modules/@supabase/functions-js/dist/main/FunctionsClient.js`), so a
 * "name" carrying a path suffix and a `?query` lands on the proxy intact:
 * `<SUPABASE_URL>/functions/v1/booqable-proxy/<path>?<query>`. The proxy
 * then strips its own `/booqable-proxy` prefix off `url.pathname` to
 * recover `<path>` and appends `url.search` verbatim to the Booqable URL.
 *
 * Putting the request in the POST body instead — which this used to do —
 * meant every call arrived as `POST /booqable-proxy` with an EMPTY path and
 * an EMPTY `url.search`: `matchAllowlist('POST', '')` missed (403 on every
 * call), and `?include=…` / `page[number]` / `page[size]` never reached
 * Booqable at all, so `included` came back empty on every sideload.
 *
 * `URLSearchParams` percent-encodes the bracketed JSON:API keys
 * (`page[number]` → `page%5Bnumber%5D`) exactly the way the Booqable docs'
 * own example links do. `undefined` values are dropped rather than
 * serialized as the literal string "undefined".
 */
function buildProxyInvokePath(path: string, query: BooqableRequestOptions['query']): string {
  const relativePath = path.replace(/^\/+/, '').replace(/\/+$/, '')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue
    params.append(key, String(value))
  }
  const search = params.toString()
  const base = relativePath ? `${BOOQABLE_PROXY_FUNCTION_NAME}/${relativePath}` : BOOQABLE_PROXY_FUNCTION_NAME
  return search ? `${base}?${search}` : base
}

/**
 * Core request function. Every other exported function in this file goes
 * through this one — it is the single place that talks to
 * `booqable-proxy`, attaches auth, and retries.
 *
 * Retries on 429/5xx with exponential backoff + jitter, max
 * `MAX_RETRY_ATTEMPTS` attempts total (SPEC_ARCH proxy responsibility 5) —
 * then throws, surfacing the last failure rather than retrying forever.
 */
export async function booqableFetch(options: BooqableRequestOptions): Promise<BooqableProxyEnvelope> {
  await assertAuthenticated()

  let lastFailure: Error = new Error('Booqable proxy call was never attempted.')

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleep(backoffDelayMs(attempt - 2))
    }

    // GET/DELETE carry no body — the proxy reads `req.text()` only for the
    // other verbs, and forwards whatever it read to Booqable byte-for-byte,
    // so `body` here must be Booqable's own payload and nothing else.
    const sendsBody = options.method !== 'GET' && options.method !== 'DELETE' && options.body !== undefined && options.body !== null

    const { data, error } = await supabase.functions.invoke<BooqableProxyEnvelope>(
      buildProxyInvokePath(options.path, options.query),
      {
        method: options.method,
        ...(options.idempotencyKey ? { headers: { 'Idempotency-Key': options.idempotencyKey } } : {}),
        ...(sendsBody ? { body: options.body as Record<string, unknown> } : {}),
      },
    )

    if (error) {
      // FunctionsRelayError / FunctionsFetchError / an uncaught exception in
      // the function itself — all transport-level, worth retrying up to the
      // ceiling exactly like a Booqable-side 5xx would be.
      lastFailure = error instanceof Error ? error : new Error(String(error))
      continue
    }
    if (!data) {
      lastFailure = new Error('Booqable proxy returned an empty response body.')
      continue
    }

    if (isRetryableStatus(data.status)) {
      lastFailure = new BooqableProxyError(`Booqable responded ${data.status}; retrying.`, data.status, data.body)
      continue
    }

    if (!data.ok) {
      throw new BooqableProxyError(
        data.proxyError ?? `Booqable proxy call failed with status ${data.status}`,
        data.status,
        data.body,
      )
    }

    return data
  }

  throw lastFailure
}

/* ── pagination ─────────────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 (UNCONFIRMED_BOOQABLE_FACTS[5]) — the documented
 * v4 shape is page[number]/page[size], 1-based. The bracketed keys are
 * URL-encoded (page%5Bnumber%5D) by the query serializer downstream, same
 * as the docs' own example links. */

export function buildPaginationQuery(page: number, perPage: number): Record<string, string | number> {
  return { 'page[number]': page, 'page[size]': perPage }
}

/* ── JSON:API parsing — data + included, flattened into typed objects ───── */

/** A resource's `id`/`type` alongside its attributes, spread flat — no more `.attributes.foo` reaching. */
export type BooqableFlatResource<TType extends string, TAttributes> = TAttributes & {
  id: BooqableId
  type: TType
}

export function flattenResource<TType extends string, TAttributes>(
  resource: BooqableResource<TType, TAttributes>,
): BooqableFlatResource<TType, TAttributes> {
  return { id: resource.id, type: resource.type, ...resource.attributes }
}

function includedKey(type: string, id: BooqableId): string {
  return `${type}:${id}`
}

/** Indexes a response's `included` array by `type:id` so relationships can be resolved in O(1) — this is what makes Law 2's "one composed object per booking, never a second API call" possible once a mapper has both `data` and `included` in hand. */
export function indexIncluded(included: BooqableIncludedResource[] | undefined): Map<string, BooqableIncludedResource> {
  const map = new Map<string, BooqableIncludedResource>()
  for (const resource of included ?? []) {
    map.set(includedKey(resource.type, resource.id), resource)
  }
  return map
}

/** Resolves a to-one relationship (e.g. `orderLine.product`) against an indexed `included` map. `undefined` if the relationship is null or the target was not present in `included`. */
export function resolveRelated<TType extends string, TAttributes>(
  relationship: BooqableRelationship<TType> | undefined,
  included: Map<string, BooqableIncludedResource>,
): BooqableFlatResource<TType, TAttributes> | undefined {
  const identifier = relationship?.data
  if (!identifier || Array.isArray(identifier)) return undefined
  const found = included.get(includedKey(identifier.type, identifier.id))
  if (!found) return undefined
  return { id: found.id, type: found.type as TType, ...(found.attributes as TAttributes) }
}

/** Resolves a to-many relationship (e.g. `order.order_lines`) against an indexed `included` map. Entries whose target is missing from `included` are skipped, never left as a dangling identifier. */
export function resolveRelatedMany<TType extends string, TAttributes>(
  relationship: BooqableRelationship<TType> | undefined,
  included: Map<string, BooqableIncludedResource>,
): BooqableFlatResource<TType, TAttributes>[] {
  const identifiers = relationship?.data
  if (!identifiers || !Array.isArray(identifiers)) return []
  const resolved: BooqableFlatResource<TType, TAttributes>[] = []
  for (const identifier of identifiers) {
    const found = included.get(includedKey(identifier.type, identifier.id))
    if (found) resolved.push({ id: found.id, type: found.type as TType, ...(found.attributes as TAttributes) })
  }
  return resolved
}

export interface ParsedBooqableList<TType extends string, TAttributes> {
  records: BooqableFlatResource<TType, TAttributes>[]
  included: Map<string, BooqableIncludedResource>
  meta: BooqablePageMeta | undefined
  links: BooqableLinks | undefined
}

export function parseListResponse<TType extends string, TAttributes>(
  response: BooqableListResponse<TType, TAttributes>,
): ParsedBooqableList<TType, TAttributes> {
  return {
    records: response.data.map((resource) => flattenResource(resource)),
    included: indexIncluded(response.included),
    meta: response.meta,
    links: response.links,
  }
}

export interface ParsedBooqableSingle<TType extends string, TAttributes> {
  record: BooqableFlatResource<TType, TAttributes>
  included: Map<string, BooqableIncludedResource>
}

export function parseSingleResponse<TType extends string, TAttributes>(
  response: BooqableSingleResponse<TType, TAttributes>,
): ParsedBooqableSingle<TType, TAttributes> {
  return {
    record: flattenResource(response.data),
    included: indexIncluded(response.included),
  }
}

/* ── high-level convenience calls ──────────────────────────────────────── */

export async function booqableList<TType extends string, TAttributes>(
  path: string,
  query?: BooqableRequestOptions['query'],
): Promise<ParsedBooqableList<TType, TAttributes>> {
  const envelope = await booqableFetch({ path, method: 'GET', query })
  return parseListResponse(envelope.body as BooqableListResponse<TType, TAttributes>)
}

/** Same as `booqableList`, with the page/perPage pair pre-encoded per `BOOQABLE_PAGINATION_STYLE`. */
export async function booqableListPage<TType extends string, TAttributes>(
  path: string,
  page: number,
  perPage: number,
  extraQuery?: BooqableRequestOptions['query'],
): Promise<ParsedBooqableList<TType, TAttributes>> {
  return booqableList(path, { ...buildPaginationQuery(page, perPage), ...extraQuery })
}

export async function booqableGet<TType extends string, TAttributes>(
  path: string,
): Promise<ParsedBooqableSingle<TType, TAttributes>> {
  const envelope = await booqableFetch({ path, method: 'GET' })
  return parseSingleResponse(envelope.body as BooqableSingleResponse<TType, TAttributes>)
}

/**
 * Create/update — POST/PATCH/PUT only (DELETE has no body to parse; use
 * `booqableDelete`). `idempotencyKey` is mandatory and must be the caller's
 * existing `client_uuid` — see the Law 9 note on `BooqableRequestOptions`.
 */
export async function booqableWrite<TType extends string, TAttributes>(
  path: string,
  method: BooqableWriteMethod,
  body: unknown,
  idempotencyKey: string,
): Promise<ParsedBooqableSingle<TType, TAttributes>> {
  const envelope = await booqableFetch({ path, method, body, idempotencyKey })
  return parseSingleResponse(envelope.body as BooqableSingleResponse<TType, TAttributes>)
}

/** Same idempotency-key contract as `booqableWrite`. No response body to parse. */
export async function booqableDelete(path: string, idempotencyKey: string): Promise<void> {
  await booqableFetch({ path, method: 'DELETE', idempotencyKey })
}

// Re-exported so a mapper can build a to-one/to-many resolver call without a
// second import line back into `types.ts` just for the identifier shape.
export type { BooqableResourceIdentifier }
