/**
 * Error reporting — one function, no SDK.
 *
 * Before this file, a render-time crash in production was caught by
 * `components/shell/ErrorBoundary` and written to `console.error`, where
 * nobody was standing. The operator saw a banner, the crash was never
 * reported, and the same bug could run for weeks in the warehouse without a
 * single person who could fix it ever learning it existed.
 *
 * ## Why no `@sentry/browser`
 *
 * The SDK is ~30 kB gzipped of transport, integrations and session tracking
 * for what this app actually needs: post one JSON envelope when something
 * throws. It is also a paid dependency decision nobody has made. This module
 * speaks Sentry's public envelope endpoint directly — the same HTTP contract
 * the SDK uses — so if Sentry (or a self-hosted GlitchTip / Bugsink, which
 * accept the same envelope format) is ever chosen, it works with a DSN and no
 * code change. If it is never chosen, this costs ~1 kB and does nothing.
 *
 * ## The gate
 *
 * `VITE_SENTRY_DSN` unset — the normal state of this repo, and of every dev
 * machine — means `captureError` returns immediately. No network, no
 * listeners, no console noise. Nothing here can be the reason a page is slow
 * or a test is flaky.
 *
 * **No DSN is committed.** It is supplied per environment at build time. A
 * Sentry DSN is a public client key by design (it can only write events), but
 * it still names the project, so it is configured, not checked in.
 *
 * ## What is sent, and what is deliberately not
 *
 * Error name, message, stack, the build's release tag, and `location.pathname`
 * — **path only**. The query string and hash are dropped: search boxes and
 * filter state end up there, and PLAN.md's privacy posture does not put client
 * data into a third-party log because a URL happened to carry it.
 *
 * Callers control the rest through `context`. That bag is serialised verbatim,
 * so **do not put client PII, phone numbers, or rupee figures in it** — pass
 * ids and counts, which are enough to find the bug. Money is a role-gated
 * concern in this product (Warehouse/Technician/Driver/Client see none of it);
 * an error report is not a hole in that.
 *
 * ## Failure posture
 *
 * Monitoring never becomes the outage. Every path is wrapped: a malformed DSN,
 * a circular `context`, a blocked request or a missing `fetch` all end in a
 * silent return. `captureError` is synchronous, returns `void`, never throws
 * and never rejects — it is safe to call from a `catch` block, from
 * `componentDidCatch`, and from an unload handler.
 */

/** Extra facts attached to a report. Serialised as-is — no PII, no money. */
export type ErrorContext = Record<string, unknown>

interface ParsedDsn {
  readonly envelopeUrl: string
}

/**
 * Reads one key off Vite's env bag.
 *
 * `import.meta.env` is typed in `src/vite-env.d.ts` with only the two Supabase
 * keys spelled out, so this goes through an untyped read and narrows on the
 * way out. The `typeof` check is the actual guarantee: anything that is not a
 * non-empty string becomes `''`, which every caller reads as "not configured".
 */
function readEnv(key: string): string {
  try {
    const bag = import.meta.env as unknown as Record<string, unknown>
    const raw = bag[key]
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/**
 * `https://<publicKey>@<host><path>/<projectId>` → the envelope endpoint.
 *
 * The key travels in the query string (`sentry_key`) rather than an
 * `X-Sentry-Auth` header, because a custom header would force a CORS preflight
 * on every report and `navigator.sendBeacon` cannot set headers at all.
 */
function parseDsn(dsn: string): ParsedDsn | null {
  if (!dsn) return null
  try {
    const u = new URL(dsn)
    const publicKey = u.username
    const segments = u.pathname.split('/').filter(Boolean)
    const projectId = segments.pop()
    if (!publicKey || !projectId) return null
    const prefix = segments.length > 0 ? `/${segments.join('/')}` : ''
    return {
      envelopeUrl:
        `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/` +
        `?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`,
    }
  } catch {
    // A DSN typo is a deployment mistake, not a runtime error for the operator
    // to see. It disables reporting; it does not break the app.
    return null
  }
}

const DSN = parseDsn(readEnv('VITE_SENTRY_DSN'))
const RELEASE = readEnv('VITE_APP_VERSION')
const ENVIRONMENT = readEnv('MODE') || 'production'

/**
 * A crash inside a render loop can fire hundreds of times a second. These caps
 * mean a broken screen files a report, not a denial-of-service against the
 * error tracker (and, on a metered Nepali mobile connection, not a data bill).
 */
const MAX_EVENTS_PER_SESSION = 25
const DEDUPE_WINDOW_MS = 5_000

let sentCount = 0
const lastSeen = new Map<string, number>()

/** 32 lowercase hex characters — the shape Sentry requires for `event_id`. */
function newEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '')
    }
  } catch {
    /* falls through to Math.random */
  }
  let out = ''
  while (out.length < 32) out += Math.floor(Math.random() * 16).toString(16)
  return out.slice(0, 32)
}

interface Described {
  type: string
  value: string
  stack: string
}

/** Anything can be thrown in JS, so `unknown` in and a describable shape out. */
function describe(err: unknown): Described {
  if (err instanceof Error) {
    return {
      type: err.name || 'Error',
      value: err.message || String(err),
      stack: typeof err.stack === 'string' ? err.stack : '',
    }
  }
  if (typeof err === 'string') return { type: 'Error', value: err, stack: '' }
  try {
    const json = JSON.stringify(err)
    return { type: 'Error', value: typeof json === 'string' ? json : String(err), stack: '' }
  } catch {
    return { type: 'Error', value: 'Unserialisable value was thrown', stack: '' }
  }
}

/** Path only — never `search` or `hash`. See the header note on privacy. */
function pagePath(): string {
  try {
    return typeof location !== 'undefined' ? location.pathname : ''
  } catch {
    return ''
  }
}

/**
 * Fire and forget. `sendBeacon` first because it survives the page being torn
 * down — which is exactly what happens when a crash is followed by the
 * operator hitting reload — and because it never triggers a preflight. `fetch`
 * with `keepalive` is the fallback for browsers where the beacon queue is full
 * or the API is missing.
 */
function post(body: string): void {
  if (!DSN) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
      if (navigator.sendBeacon(DSN.envelopeUrl, blob)) return
    }
    if (typeof fetch === 'function') {
      void fetch(DSN.envelopeUrl, {
        method: 'POST',
        body,
        keepalive: true,
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      }).catch(() => {
        /* offline, blocked by an extension, DNS down — all fine, all silent */
      })
    }
  } catch {
    /* monitoring never becomes the outage */
  }
}

/** True when a DSN was supplied and parsed. Reports are dropped when false. */
export function isMonitoringEnabled(): boolean {
  return DSN !== null
}

/**
 * Report a caught error.
 *
 * No-ops entirely unless `VITE_SENTRY_DSN` is set at build time. Synchronous,
 * never throws, never rejects.
 *
 * @param err     Whatever was caught — `Error`, string, or any thrown value.
 * @param context Extra facts. Ids and counts only: no client PII, no rupee
 *                amounts. See the module header.
 */
export function captureError(err: unknown, context?: ErrorContext): void {
  if (!DSN) return
  if (sentCount >= MAX_EVENTS_PER_SESSION) return

  try {
    const { type, value, stack } = describe(err)

    const fingerprint = `${type}:${value}`
    const now = Date.now()
    const previous = lastSeen.get(fingerprint)
    if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return
    lastSeen.set(fingerprint, now)

    const eventId = newEventId()
    const event = {
      event_id: eventId,
      timestamp: now / 1000,
      platform: 'javascript',
      level: 'error',
      logger: 'babin-rentals-os',
      environment: ENVIRONMENT,
      ...(RELEASE ? { release: RELEASE } : {}),
      exception: { values: [{ type, value }] },
      request: { url: pagePath() },
      extra: {
        ...(stack ? { stack } : {}),
        ...(context ?? {}),
      },
    }

    // Built before anything is sent: a circular `context` throws here, inside
    // the try, rather than leaving a half-written envelope on the wire.
    const envelope =
      `${JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString() })}\n` +
      `${JSON.stringify({ type: 'event' })}\n` +
      `${JSON.stringify(event)}\n`

    sentCount += 1
    post(envelope)
  } catch {
    /* a report that cannot be built is dropped, never surfaced */
  }
}
