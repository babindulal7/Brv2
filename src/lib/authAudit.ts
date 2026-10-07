import { logAuditEvent } from './audit'

/**
 * Login and logout leave a trace (Booqable adoption spec G6 — Booqable logs neither).
 *
 * **Failed logins are NOT recorded here, and cannot be from the browser.** At that moment there is no
 * session, `audit_events_insert` refuses anonymous writes (0091, the SEC-02 forgery), and loosening it so a
 * stranger can write rows would be a worse hole than the missing row. The honest source is GoTrue's own
 * auth log; recording it in `audit_events` needs a server-side hook. Listed under Remaining in PROGRESS.
 *
 * RULING 2026-10-07: action `Login` / `Logout`, module `Authentication`, `new_values.event` carries the
 * namespaced name (`auth.login`, `auth.logout`). Fire-and-forget — an audit outage never blocks signing in
 * or out (PLAN.md §4.36).
 */
const MARK = 'br.auth.login-audited:'

export function recordLogin(userId: string, signInStamp: string | null | undefined): void {
  /* supabase-js emits SIGNED_IN again when a tab regains focus. One row per actual sign-in, not per focus. */
  const key = `${MARK}${userId}:${signInStamp ?? 'unknown'}`
  try {
    if (globalThis.sessionStorage?.getItem(key) === '1') return
    globalThis.sessionStorage?.setItem(key, '1')
  } catch {
    /* storage refused — a duplicate row is better than none */
  }
  void logAuditEvent({
    eventClass: 'session',
    category: 'Authentication',
    module: 'Authentication',
    action: 'Login',
    tableName: 'auth.sessions',
    recordId: userId,
    actorId: userId,
    newValues: { event: 'auth.login' },
  })
}

/** Resolves when the row is written or after `timeoutMs`, so sign-out is never held hostage by the network. */
export function recordLogout(userId: string | null, timeoutMs = 1500): Promise<void> {
  if (!userId) return Promise.resolve()
  const write = logAuditEvent({
    eventClass: 'session',
    category: 'Authentication',
    module: 'Authentication',
    action: 'Logout',
    tableName: 'auth.sessions',
    recordId: userId,
    actorId: userId,
    newValues: { event: 'auth.logout' },
  }).then(() => undefined)
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  return Promise.race([write, timeout])
}
