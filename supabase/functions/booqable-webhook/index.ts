// supabase/functions/booqable-webhook/index.ts
//
// Supabase Edge Function — DENO runtime. Uses `Deno.serve` / `Deno.env.get`
// only; no Node built-ins, no `process.env`, no `require`. Deployed and
// type-checked by the Supabase CLI's own Deno toolchain, which is why this
// directory is intentionally outside `tsconfig.json`'s `"include": ["src"]`
// — it is a different runtime with different globals, not a bug.
//
// ============================================================================
// SPEC_ARCH — what this function is and is not
// ============================================================================
//
// Booqable sends webhook POSTs here. Per spec §12, this function has exactly
// four responsibilities, in this order of precedence:
//
//   1. Verify the request's authenticity (`verifyWebhookUrlToken`, isolated
//      and named so the scheme stays a one-function edit — Booqable v4
//      signs NOTHING, confirmed 10 Aug 2026; see the fact #3 block below).
//   2. An unauthenticated or bad-token request still gets INSERTED into
//      `sync_inbox` (with `signature_ok = false`) before this function
//      responds 401 — a rejected webhook is evidence of something (a
//      misconfigured secret, a spoofed sender, a URL registered without its
//      token), never a silent drop.
//   3. A verified request gets inserted into `sync_inbox` and this function
//      returns HTTP 200 IMMEDIATELY. It never processes the event inline —
//      `processSyncInboxEvent` below is a separate, uninvoked function for
//      exactly that reason. Booqable's own retry behaviour on a slow/failing
//      webhook endpoint is not something this function should have to
//      survive by doing real work synchronously.
//   4. Nothing in this file trusts the webhook BODY as truth — it is a hint
//      that something changed, stored verbatim in `sync_inbox.raw` for the
//      eventual processor to look at, but the processor's contract (see the
//      comment on `processSyncInboxEvent`) is to re-fetch the resource by ID
//      from Booqable before writing any mirror table. That is what makes
//      out-of-order delivery harmless — two webhooks for the same order
//      arriving in the wrong order both resolve to the same re-fetched
//      state, whichever runs last.
//
// ============================================================================
// Law 17 — "client" only
// ============================================================================
//
// PLAN.md §0 law 17 + the integration-specific ruling in `types.ts`:
// Booqable's own raw wire term for this resource is allowed in exactly ONE
// file in this whole integration — `src/lib/booqable/types.ts`, because that
// file mirrors Booqable's raw wire vocabulary. This file is not that file.
// Where this comment block needs to refer to the Booqable resource that
// local code calls a "client", it says "client" and points back to
// `types.ts` for Booqable's own wire name, rather than spelling that word
// out here.
//
// ============================================================================
// Fact #3 — CONFIRMED 10 Aug 2026 (spec §3.2; see `src/lib/booqable/types.ts`
// `UNCONFIRMED_BOOQABLE_FACTS[3]` for the full findings + source URLs:
// https://developers.booqable.com/#webhook-endpoints and #webhooks)
// ============================================================================
//
// SIGNING: Booqable v4 documents NO webhook signing at all. The complete
// webhook_endpoints resource has exactly six fields — created_at, events,
// id, updated_at, url, version — no signing secret is issued at
// subscription time, so there is nothing to HMAC with, and no delivery
// headers of any kind are documented. The previous placeholder
// (X-Booqable-Signature + HMAC-SHA256 over the raw body) therefore
// verified a header Booqable never sends. Per the integration's security
// posture, authenticity is now layered as:
//   1. verifyWebhookUrlToken below — a shared secret embedded in the
//      REGISTERED webhook URL (?token=..., compared timing-safe against
//      BOOQABLE_WEBHOOK_SECRET). Booqable echoes the registered URL
//      verbatim on delivery, so only a sender that knows the URL passes.
//      Its result is recorded in `sync_inbox.signature_ok` (column name
//      kept — it means "authenticity check passed") and a failure still
//      inserts the row, then answers 401, exactly as before.
//   2. The processor's re-fetch-by-id contract (`processSyncInboxEvent`) —
//      the REAL defense: the body is never trusted, so a spoofed body
//      cannot lie its way into a mirror table. GET /api/4/webhooks/{id}
//      also exists to re-fetch a delivered notification by its envelope id
//      ("Webhooks are only available for a limited time after the event
//      occurred") as an additional verification path.
//
// ENVELOPE (CONFIRMED): v4 (opt-in, version: 4, application/json):
//   { id: <NOTIFICATION uuid, not the resource>, created_at, event (e.g.
//     "customer.created"), resource_type (e.g. "customers"), data: {...} }
// v1 (default, application/x-www-form-urlencoded!) is identical except
// `object` (singular classname, e.g. "Customer") replaces `resource_type`.
// The RESOURCE's own id lives at data.id — the top-level id is the
// notification id. Payload is plain JSON, NOT JSON:API. Subscribe with
// version: 4 — a v1 subscription arrives urlencoded and lands in the
// JSON-parse fallback below.
//
// EVENT NAMES (CONFIRMED, closed 45-name enum on webhook_endpoints.events):
// there is NO order.created, product.updated, product.archived,
// stock_item.*, payment.created, or document.* — coverage comes from
// order.updated + the per-status order events (order.reserved/started/
// stopped/canceled/reverted/saved_as_draft/saved_as_concept/archived),
// cart.completed_checkout, customer.created/updated/archived,
// product.created, product_group.created/updated/archived,
// payment.completed, and invoice/contract/quote.* — gaps (product updates,
// stock items) need polling/backfill instead of webhooks.
//
// ============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'

/* ── env ────────────────────────────────────────────────────────────────
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
 * every Supabase Edge Function at deploy time — not set by hand, and never
 * the same as the anon key `src/` uses (Platform Build Instructions §7:
 * "ANON KEY ONLY" in anything the browser can read; this function is the
 * opposite side of that boundary — it runs server-side and legitimately
 * holds a service-role key precisely because it must write `sync_inbox`
 * regardless of RLS, exactly like `0040_booqable_sync.sql`'s own header
 * comment documents for these queue tables).
 *
 * BOOQABLE_WEBHOOK_SECRET is the shared secret embedded in the webhook URL
 * registered with Booqable (?token=<secret> — see the fact #3 block above:
 * v4 issues no signing secret and signs nothing, so the URL token IS the
 * shared secret). Lives ONLY here (`Deno.env.get`), never a
 * `VITE_`-prefixed variable, never anything under `src/` — same hard rule
 * as `BOOQABLE_TOKEN`/`BOOQABLE_SLUG` for `booqable-proxy`. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const BOOQABLE_WEBHOOK_SECRET = Deno.env.get('BOOQABLE_WEBHOOK_SECRET')

/** The query-param name carrying the shared secret in the REGISTERED webhook URL (fact #3 — v4 delivers no auth headers, so the URL is the only sender-supplied channel we control). */
const WEBHOOK_URL_TOKEN_PARAM = 'token'

function getServiceRoleClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'booqable-webhook: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in the function environment.',
    )
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/* ── authenticity verification — URL token (fact #3, CONFIRMED) ─────────── */

/**
 * CONFIRMED 10 Aug 2026 (fact #3, see the header block): Booqable v4 does
 * NOT sign webhook deliveries — no secret is issued at subscription time
 * and no delivery headers are documented — so the old HMAC-header
 * verification checked a header that never arrives. The replacement is a
 * shared secret embedded in the webhook URL registered with Booqable
 * (`?token=<BOOQABLE_WEBHOOK_SECRET>`): Booqable calls the registered URL
 * verbatim, so possession of the token in the request URL is the
 * sender-authenticity signal. Kept as an isolated named function (same
 * contract as the old `verifyBooqableSignature`) so any future scheme
 * change stays a one-function edit.
 *
 * Returns `false` (never throws) on ANY failure — missing secret, missing
 * param, mismatch — so the caller always gets a clean boolean to record in
 * `sync_inbox.signature_ok` and decide the HTTP status from, rather than an
 * exception that could accidentally skip the "insert regardless"
 * requirement (spec §12 item 2). The deeper defense remains the
 * processor's re-fetch-by-id contract — see `processSyncInboxEvent`.
 */
function verifyWebhookUrlToken(requestUrl: URL, secret: string | undefined): boolean {
  if (!secret) return false
  const token = requestUrl.searchParams.get(WEBHOOK_URL_TOKEN_PARAM)
  if (!token) return false
  return timingSafeEqualString(token, secret)
}

/** Constant-time-ish comparison — avoids a naive `===` short-circuit leaking
 * token-length/prefix information via response timing. Deno's Web Crypto
 * surface has no built-in `timingSafeEqual`, so this is hand-rolled; length
 * is compared first without leaking which character differed. */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/* ── sync_inbox row shape (mirrors 0040_booqable_sync.sql `sync_inbox`) ─── */

type SyncStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped'

interface SyncInboxInsert {
  event: string
  entity: string | null
  external_id: string | null
  signature_ok: boolean
  raw: unknown
  status: SyncStatus
}

/**
 * Extraction of `event` / `entity` / `external_id` from the webhook body —
 * CONFIRMED envelope, 10 Aug 2026 (fact #3 header block; docs
 * #webhook-endpoints Fields table):
 *   event       → envelope.event          ("The type of event that triggered
 *                                           this webhook", e.g. "order.updated")
 *   entity      → envelope.resource_type  (v4 — "The JSON API resource
 *                  ?? envelope.object       type... Examples: orders, products,
 *                                           customers"; v1 uses `object`, a
 *                                           singular classname like "Customer")
 *   external_id → envelope.data.id        (the RESOURCE's own id lives inside
 *                                           `data` — the TOP-LEVEL `id` is the
 *                                           notification id, deliberately NOT
 *                                           read here)
 * Still for observability/filtering only — the processor's contract is to
 * re-fetch by id, never to trust the body (`raw` always carries the
 * untouched payload, so nothing is lost if a shape ever deviates).
 */
function extractEventHints(body: unknown): { event: string; entity: string | null; externalId: string | null } {
  if (typeof body !== 'object' || body === null) {
    return { event: 'unknown', entity: null, externalId: null }
  }
  const record = body as Record<string, unknown>

  const event = firstString(record.event) ?? 'unknown'

  // v4: resource_type; v1: object (docs — the only difference between the
  // two envelope versions besides the data format).
  const entity = firstString(record.resource_type) ?? firstString(record.object) ?? null

  // data.id, NEVER the top-level id (that is the notification's own uuid).
  const externalId = firstString((record.data as Record<string, unknown> | undefined)?.id) ?? null

  return { event, entity, externalId }
}

function firstString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Inserts one `sync_inbox` row. The only DB write this function performs —
 * see the file header for why processing is deliberately NOT done here.
 */
async function insertSyncInboxRow(
  client: SupabaseClient,
  row: SyncInboxInsert,
): Promise<{ id: string } | null> {
  const { data, error } = await client.from('sync_inbox').insert(row).select('id').single()

  if (error) {
    console.error('booqable-webhook: sync_inbox insert failed', error)
    return null
  }
  return data as { id: string }
}

/* ============================================================================
 * Processing — deliberately NOT wired to anything in this pass.
 * ============================================================================
 *
 * TODO(decision): draining `sync_inbox` needs a scheduled trigger. Supabase
 * Edge Functions have no built-in cron/scheduler of their own — this would
 * need `pg_cron` calling a processing Edge Function on an interval, or an
 * external scheduler (e.g. a GitHub Action / Supabase's own dashboard cron
 * feature) hitting an HTTP endpoint that runs this logic. Neither is set up
 * in this pass; inventing one here would be exactly the kind of unrequested
 * product decision CLAUDE.md's hard rule forbids ("never invent a product
 * decision to unblock yourself — mark TODO(decision)").
 *
 * This function is defined — not merely commented as a TODO — so its
 * CONTRACT is pinned down even though nothing invokes it yet:
 *
 *   - Events are hints, not truth (spec §12 item 4). This function MUST
 *     re-fetch the resource identified by `row.entity` / `row.external_id`
 *     from Booqable (via a server-side Booqable client — NOT `client.ts`,
 *     which calls `booqable-proxy` on behalf of an authenticated browser
 *     session and has no such session here) rather than trust
 *     `row.raw`'s body for any field value it writes into a mirror table.
 *     That is what makes processing webhooks out of order harmless: two
 *     events for the same resource, processed in either order, both end by
 *     re-fetching and converge on the same final state.
 *   - A row with `signature_ok === false` reaching this function is a
 *     decision point this pass leaves unmade: process it anyway (the
 *     resource-refetch step means a spoofed *body* can't lie, but a
 *     spoofed *sender* could still trigger a real, unwanted refetch/write
 *     cycle) or require a human to mark it reviewed first. TODO(decision).
 *   - Terminal states for a row are `done`, `failed`, or `skipped`
 *     (`sync_status` enum, `0040_booqable_sync.sql`) — this function should
 *     update `status`/`attempts`/`error`/`processed_at` on the row it
 *     processed, never leave it stuck at `pending` or `processing`.
 *   - Law 3 ("nothing is deleted"): an archive/delete-flavoured event must
 *     resolve to setting a local `deleted_at` timestamp, never an actual
 *     row delete. Law 4/5 apply the same way to any payment/deposit event
 *     this function eventually handles. None of that is implemented here —
 *     this stub exists to pin the contract, not to satisfy it.
 */
export async function processSyncInboxEvent(_row: {
  id: string
  event: string
  entity: string | null
  external_id: string | null
  signature_ok: boolean
  raw: unknown
}): Promise<void> {
  throw new Error(
    'processSyncInboxEvent is not implemented in this pass — see the TODO(decision) block above it. ' +
      'Nothing in booqable-webhook/index.ts invokes this function; it exists only to pin the processing contract.',
  )
}

/* ── HTTP handler ─────────────────────────────────────────────────────── */

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' })
  }

  // Raw text FIRST — `sync_inbox.raw` must carry the payload verbatim, and
  // a v1-version subscription would arrive urlencoded (fact #3), which the
  // JSON-parse fallback below wraps rather than drops.
  const rawBody = await req.text()

  // Fact #3 (CONFIRMED): v4 sends no signature — authenticity is the shared
  // secret in the registered webhook URL. `signatureOk` keeps its name
  // because sync_inbox.signature_ok is the recorded column either way.
  const signatureOk = verifyWebhookUrlToken(new URL(req.url), BOOQABLE_WEBHOOK_SECRET)

  let parsedBody: unknown
  try {
    parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : {}
  } catch {
    // Not valid JSON — still insert. `raw` is `jsonb not null`, so wrap the
    // unparseable text rather than drop the event (spec §12 item 2's "never
    // silently drop it — it is evidence" applies just as much to a bad body
    // as to a bad signature).
    parsedBody = { _unparseable_raw_body: rawBody }
  }

  const { event, entity, externalId } = extractEventHints(parsedBody)

  let client: SupabaseClient
  try {
    client = getServiceRoleClient()
  } catch (err) {
    console.error('booqable-webhook: cannot construct service-role client', err)
    return jsonResponse(500, { error: 'server misconfigured' })
  }

  const inserted = await insertSyncInboxRow(client, {
    event,
    entity,
    external_id: externalId,
    signature_ok: signatureOk,
    raw: parsedBody,
    status: 'pending',
  })

  if (!inserted) {
    // The insert itself failed (DB error, not a signature problem) — this
    // is the one case where we cannot honour "insert then 200" because
    // there is no row. Surface it as a real failure so Booqable's own
    // retry behaviour has a chance to redeliver, rather than swallow it.
    return jsonResponse(500, { error: 'failed to record event' })
  }

  if (!signatureOk) {
    // Spec §12 item 2: recorded as evidence, but the response itself is a
    // 401 — this request did not prove it came from Booqable.
    return jsonResponse(401, { received: true, id: inserted.id, signatureValid: false })
  }

  // Spec §12 item 3: 200 immediately. No processing happens on this
  // request — see `processSyncInboxEvent` above for why, and for what a
  // future drainer must do with this row.
  return jsonResponse(200, { received: true, id: inserted.id, signatureValid: true })
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
