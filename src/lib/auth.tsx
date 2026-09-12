import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { supabase, IS_MOCK } from './supabase'
import { getSetting } from './settingsStore'
import { captureError } from './monitoring'
import { purgeDeviceReadCaches } from './devicePurge'

/**
 * The session role IS the system role. They were separate unions until 8 Aug 2026,
 * which forced a lossy shim on every screen that needed a capability check.
 * `SystemRole` is now the business 8, so there is one vocabulary and no mapping.
 */
export type { SystemRole as Role } from '../types/database'
import type { SystemRole } from '../types/database'
type Role = SystemRole

interface AuthUser {
  id: string
  name: string
  role: Role
  isSharedDevice: boolean
}

/**
 * The verdict from `verify_staff_pin` (migration 0066).
 *
 * `ok` is the ONLY field that may unlock anything, and it is true only when the
 * database compared a bcrypt hash and it matched. Every other shape — no
 * session, no PIN enrolled, locked out, deactivated staff row, malformed input,
 * or a network failure that never reached Postgres — resolves to `ok: false`.
 * There is deliberately no third state: a lock that cannot verify must stay
 * locked, and an `undefined` would eventually be read as falsy-but-fine by
 * somebody.
 */
export type PinRejection =
  | 'no_session'
  | 'no_pin'
  | 'locked'
  | 'inactive'
  | 'malformed'
  | 'incorrect'
  | 'unavailable'

export interface PinVerdict {
  ok: boolean
  // `| undefined` is spelled out on every optional field below because this
  // project runs `exactOptionalPropertyTypes: true` — "absent" and "present and
  // undefined" are different types, and the RPC mapper produces the latter.
  reason?: PinRejection | undefined
  attemptsRemaining?: number | undefined
  lockedUntil?: string | null | undefined
  /** Present only for `unavailable` — the underlying failure, for the screen to show verbatim. */
  message?: string | undefined
}

/** What `staff_pin_status` reports about the caller's own PIN. Never a hash. */
export interface PinStatus {
  hasPin: boolean
  setAt?: string | null | undefined
  lockedUntil?: string | null | undefined
  lastUsedAt?: string | null | undefined
}

interface AuthContextType {
  user: AuthUser | null
  /**
   * True until the very first session lookup resolves. `Shell` must not bounce
   * to /login while this is true, or every page refresh flashes the login screen
   * before the restored session lands.
   */
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  /**
   * Send a password-reset link to `email`.
   *
   * ⚠ Read `requestPasswordReset`'s own comment before writing UI against this.
   * A `null` error does **not** mean an email was sent — Supabase answers the
   * same way for an address with no account, deliberately.
   */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  /** Set a new password for the session established by a recovery link. */
  updatePassword: (password: string) => Promise<{ error: string | null }>
  /**
   * True once Supabase has reported `PASSWORD_RECOVERY` for this tab — i.e. the
   * visitor arrived by clicking a reset link, and the session that now exists is
   * a recovery session rather than a normal sign-in.
   */
  isPasswordRecovery: boolean
  logout: () => void
  isLocked: boolean
  setLocked: (locked: boolean) => void
  /**
   * Draw the curtain now, without signing out.
   *
   * Refuses when this session has no PIN — locking someone behind a credential
   * they do not hold leaves them with "Sign out instead" as the only way
   * forward, which is a worse outcome than not locking. `hasPin` is exposed so
   * a caller can hide the control rather than offer one that declines.
   */
  lockNow: () => void
  /** Whether this session has a PIN enrolled, so a lock can actually be reopened. */
  hasPin: boolean
  /**
   * Enrol or rotate the current session's own PIN.
   *
   * There is no `userId` parameter and there is no admin variant here, because
   * `set_staff_pin` takes none — the subject is `auth_user_id()`. See 0066.
   */
  setStaffPin: (pin: string) => Promise<{ error: string | null }>
  /**
   * Check a PIN against the current session's enrolled one.
   *
   * ⚠ This does NOT sign anyone in and cannot. It re-admits a session that
   * already holds a JWT. A caller that treats a true verdict as authentication
   * is rebuilding `VITE_DEV_AUTH_BYPASS` — see the `signIn` comment below for
   * what that cost.
   */
  verifyStaffPin: (pin: string) => Promise<PinVerdict>
  /** Whether this session has a PIN, for the settings row. Never returns a hash. */
  staffPinStatus: () => Promise<PinStatus>
  /** Remove the current session's own PIN. */
  revokeOwnStaffPin: () => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Real Supabase Auth, wired 11 Aug 2026 (replaced a hardcoded mock session that
 * made every visitor an Owner and made `Shell`'s existing `if (!user)` guard
 * unreachable).
 *
 * IDENTITY CONTRACT — `auth.users.id` IS `public.users.id`. Migration 0041's
 * PostgREST `db_pre_request` hook copies `auth.uid()` into the
 * `app.current_user_id` GUC that every RLS policy reads, so the role resolved
 * here and the role the database enforces are the same fact from the same row.
 * The UI gate is therefore a convenience, never the security boundary — Law 6
 * is enforced by RLS (PLAN.md §0).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLocked, setLocked] = useState(false)
  const [isPasswordRecovery, setPasswordRecovery] = useState(false)
  const [hasPin, setHasPin] = useState(false)

  /**
   * Resolve the staff row for a signed-in identity. The role must come from
   * `users.primary_role` — never from JWT metadata, which the client could
   * tamper with and which no RLS policy consults.
   */
  const loadProfile = useCallback(async (authId: string, fallbackEmail: string | undefined) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, primary_role')
      .eq('id', authId)
      .maybeSingle()

    /*
     * ⛔ THE READ FAILED. This is NOT the same fact as "there is no staff row",
     * and until 16 Aug 2026 this function treated them identically
     * (`if (error || !data)`), which silently demoted the signed-in Owner to
     * `Client`.
     *
     * Found by driving the app, not by reading it. `loadProfile` runs again on
     * every `onAuthStateChange` — including `TOKEN_REFRESHED`, roughly hourly.
     * When that re-read failed, the header changed from "Babin Dulal · Owner" to
     * "babindulal7@gmail.com · Client" mid-session and `/finance` began saying
     * *"Access restricted. Your role (Client) does not have access to this
     * module."* to the owner of the business. A page reload restored Owner,
     * which is what makes it so hard to report: it looks like a fluke.
     *
     * The demotion also explains the shape of the two `PROGRESS.md` incidents on
     * 12 Aug — "signed in, everything empty" — and migrations 0056/0059 were
     * both written chasing that symptom at the RLS layer. This is the same
     * symptom arriving from the client side.
     *
     * A failed read tells us NOTHING about who this session is, so it must not
     * answer the question. Keep whatever identity we had already resolved: the
     * role is a fact about the staff row, not about the health of one request,
     * and it cannot have changed because a fetch timed out. If nothing was
     * resolved yet, stay `null` — `Shell` sends an unresolved session to /login,
     * which is honest, rather than rendering a Client UI over an Owner account.
     */
    if (error) {
      captureError(error, { where: 'auth.reReadStaffRow', authId })
      setUser((previous) => previous)
      return
    }

    if (!data) {
      // Authenticated against Supabase but carrying no staff row — a real state
      // (an auth user created outside the staff table), and now genuinely
      // distinguishable from the branch above. Deliberately NOT defaulted to a
      // working role: an unknown identity gets `Client`, the portal-only role
      // every staff policy already excludes.
      setUser({
        id: authId,
        // Empty, NOT 'Unknown user'. See the note below.
        name: fallbackEmail ?? '',
        role: 'Client' as Role,
        isSharedDevice: false,
      })
      return
    }

    /*
     * `name` falls back to the EMPTY STRING, never to a placeholder.
     *
     * It was `?? 'Unknown user'`, and that is the most dangerous shape of this
     * defect because it is at the SOURCE: every screen downstream reads
     * `user.name` and stamps it as the actor on a record — a damage approval, a
     * late-fee waiver, a cleaning attribution, a CSV export's provenance row.
     * Those screens now guard by asking whether a name exists, and
     * `'Unknown user'` is a non-empty string, so it sails through every one of
     * them and lands in the record as though someone signed it.
     *
     * An empty string fails those guards, which is the point: a session whose
     * staff row carries no name and no email cannot attribute work, and the
     * screens refuse rather than writing a name nobody has. The identity is
     * still valid for reading — `id` and `role` are real and RLS answers to
     * them; it is only attribution that is withheld.
     *
     * RESOLVED 12 Aug 2026 — this was a `TODO(decision)` asking whether a staff
     * row may exist with no `full_name`. It may not: `users.full_name` is
     * **NOT NULL** on the live database (checked directly, alongside `email` and
     * `primary_role`, all three NOT NULL). So for a row that EXISTS, `full_name`
     * is always present and the `?? fallbackEmail ?? ''` chain never degrades.
     *
     * The empty string is kept anyway, and is not dead defence: the branch above
     * — an authenticated user carrying NO staff row at all — has no `full_name`
     * to read, and `fallbackEmail` is itself optional. That is the case the
     * empty string exists for, and it is a real state (an auth user created
     * outside the staff table).
     */
    setUser({
      id: data.id,
      name: data.full_name ?? fallbackEmail ?? '',
      role: data.primary_role as Role,
      isSharedDevice: false,
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const session = data.session
      if (!session) {
        setUser(null)
        setLoading(false)
        return
      }
      void loadProfile(session.user.id, session.user.email).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return

      /*
       * A recovery link is the ONLY way `PASSWORD_RECOVERY` fires. Supabase
       * establishes a real session when the link is followed, so without this
       * flag `/reset-password` cannot tell "arrived by clicking the emailed
       * link" from "already signed in and typed the URL". The first may set a
       * new password without knowing the old one; the second is a stranger at
       * an unattended desk. `setPasswordRecovery(false)` is deliberately NOT
       * called on other events — the flag is cleared by `updatePassword`
       * succeeding or by `logout`, so a token refresh mid-form does not eject
       * someone from the screen they are legitimately using.
       */
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)

      if (!session) {
        setUser(null)
        setLoading(false)
        return
      }
      void loadProfile(session.user.id, session.user.email).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  /**
   * Supabase Auth, and nothing else.
   *
   * ⛔ There were two dev doors here — `VITE_DEV_AUTH_BYPASS` (Owner on page
   * load, no credentials) and a credential fallback (Owner for
   * `owner@babinrentals.com` / `babindulal7@gmail.com` with `123`). Both were
   * removed 12 Aug 2026. Do not reintroduce either.
   *
   * They set the React `user` without signing in to Supabase, so there was no
   * JWT: every query went out as `anon`, RLS denied it, and the app rendered a
   * header reading "Owner" over empty lists — HTTP 200, no error, correct-looking
   * empty states. That failure has no symptom, and it cost a full session: a
   * database holding 120 seeded bookings was twice diagnosed as an empty
   * database, and two migrations were written against the wrong cause before the
   * request logs settled it.
   *
   * Both doors carried a loud `console.warn` saying exactly this would happen.
   * It was not enough — which is the argument against any replacement.
   *
   * The convenience they bought is real but narrow: driving layout, gating and
   * refusal paths. Anything about data arriving needs a session RLS will answer,
   * and only this call produces one.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // onAuthStateChange populates `user`; only the failure path is reported here.
    return { error: error ? error.message : null }
  }, [])

  /**
   * Email a password-reset link. Built 15 Aug 2026.
   *
   * ## ⚠ A `null` error here does NOT mean an email was sent
   *
   * `resetPasswordForEmail` answers identically for an address that has an
   * account and one that does not — that is deliberate on Supabase's side, and
   * it is the correct behaviour: an endpoint that distinguishes them is an
   * account-enumeration oracle, and the accounts in question are staff of a
   * business whose client list is commercially sensitive.
   *
   * The consequence for this app is specific and it is the whole reason this
   * comment is long: **the screen must not say "we sent you an email."** It
   * cannot know that. `ForgotPassword.tsx` says "if that address has an account"
   * instead, which is the true statement and costs the operator nothing. Writing
   * the confident sentence here would put a fresh entry in
   * `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` — a screen reporting an
   * outcome it did not verify — three days after that register was closed.
   *
   * ## `redirectTo` is not enough on its own
   *
   * The link only returns to this app if the URL is in the project's **Auth →
   * URL Configuration → Redirect URLs** allow-list. It is not set from code and
   * no migration can set it; an unlisted URL silently falls back to the Site
   * URL, which sends the operator somewhere else entirely with a valid token in
   * the address bar. Add `http://localhost:3000/reset-password` for development
   * and the deployed origin for production.
   */
  const requestPasswordReset = useCallback(async (email: string) => {
    /*
     * The mock data source's auth stub implements getSession, signInWithPassword,
     * onAuthStateChange and signOut, and nothing else — reasonably, since it
     * accepts any password for three known addresses and so has no password to
     * reset. Calling straight through would be a TypeError in the console and a
     * spinner that never resolves on the screen. Refused by name instead.
     */
    if (typeof supabase.auth.resetPasswordForEmail !== 'function') {
      return {
        error:
          'Password reset needs the live Supabase project, and this build is running on the mock data ' +
          'source (VITE_DATA_SOURCE=mock). Mock sign-in accepts any password, so there is nothing to reset.',
      }
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error: error ? error.message : null }
  }, [])

  /**
   * Set a new password on the session a recovery link established.
   *
   * Supabase requires a session for this call and the recovery link provides
   * one, which is why there is no "old password" field: possession of the link
   * sent to the address on the staff row IS the proof. It will also succeed for
   * an ordinary signed-in session, which is what makes `isPasswordRecovery`
   * necessary on the screen rather than here — this function's job is the write,
   * not deciding who may reach it.
   */
  const updatePassword = useCallback(async (password: string) => {
    // Same reason as `requestPasswordReset` — the mock stub has no `updateUser`.
    if (typeof supabase.auth.updateUser !== 'function') {
      return {
        error:
          'Setting a password needs the live Supabase project, and this build is running on the mock data ' +
          'source (VITE_DATA_SOURCE=mock).',
      }
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (!error) setPasswordRecovery(false)
    return { error: error ? error.message : null }
  }, [])

  /*
   * ── the staff PIN (migration 0066) ────────────────────────────────────────
   *
   * Four thin bindings. Every rule that matters — the 6-digit shape, the weak-PIN
   * list, the 5-attempt ceiling, the 15-minute lockout, "one live PIN per person"
   * — lives in the database, not here. That is not tidiness: this file runs in the
   * browser, so anything it enforces is a suggestion. The RPCs are reachable with
   * a fetch and no numpad.
   *
   * The mock data source implements `rpc()` and answers unimplemented functions
   * with PostgREST error 42883, so calling straight through would technically
   * work and would surface `[mock] rpc("verify_staff_pin") is not implemented`.
   * That is honest but it reads as a bug. Refused by name instead, matching
   * `requestPasswordReset` above.
   */

  const setStaffPin = useCallback(async (pin: string) => {
    if (IS_MOCK) {
      return {
        error:
          'Setting a PIN needs the live Supabase project, and this build is running on the mock data ' +
          'source (VITE_DATA_SOURCE=mock). The mock store has no staff_auth_pins table to write to.',
      }
    }

    // Wrapped for the same reason `verifyStaffPin` is: a thrown fetch must
    // become a returned error, not a rejected promise. The Settings test suite
    // caught this shape as an unhandled rejection while every assertion still
    // passed — a partial auth mock left the RPC undefined and the failure
    // surfaced nowhere the screen could show it.
    try {
      const { error } = await supabase.rpc('set_staff_pin', { p_pin: pin })
      // The database raises with the operator-facing sentence already written
      // ("That PIN is six identical digits. Choose another."), so it is passed
      // through rather than restated — one wording, one place to change it.
      if (!error) setHasPin(true)
      return { error: error ? error.message : null }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'The PIN could not be set.' }
    }
  }, [])

  const verifyStaffPin = useCallback(async (pin: string): Promise<PinVerdict> => {
    if (IS_MOCK) {
      return {
        ok: false,
        reason: 'unavailable',
        message:
          'PIN unlock needs the live Supabase project, and this build is running on the mock data ' +
          'source (VITE_DATA_SOURCE=mock). Sign in with your password.',
      }
    }

    /*
     * FAILS CLOSED, and the try/catch is the reason this is not a one-liner.
     *
     * A thrown fetch — offline tablet, dead Wi-Fi in the warehouse, Kong
     * restarting — must not escape to the caller as a rejected promise. The
     * lock overlay awaits this; an unhandled rejection there leaves the numpad
     * disabled with no message, which an operator reads as "the tablet froze"
     * and resolves by force-quitting into a still-live session on a shared
     * device. So every failure becomes an explicit `ok: false`.
     */
    try {
      const { data, error } = await supabase.rpc('verify_staff_pin', { p_pin: pin })

      if (error) {
        return { ok: false, reason: 'unavailable', message: error.message }
      }

      const verdict = (data ?? {}) as Record<string, unknown>

      // `ok` is read strictly. A truthy-but-not-true value (a string "false", a
      // 1, a null) is not a match, and this is the one comparison in the app
      // where being lenient would open a lock.
      return {
        ok: verdict['ok'] === true,
        reason: verdict['reason'] as PinVerdict['reason'],
        attemptsRemaining:
          typeof verdict['attempts_remaining'] === 'number'
            ? (verdict['attempts_remaining'] as number)
            : undefined,
        lockedUntil: (verdict['locked_until'] as string | null) ?? null,
      }
    } catch (cause) {
      return {
        ok: false,
        reason: 'unavailable',
        message: cause instanceof Error ? cause.message : 'The PIN could not be checked.',
      }
    }
  }, [])

  const staffPinStatus = useCallback(async (): Promise<PinStatus> => {
    if (IS_MOCK) return { hasPin: false }

    /*
     * `hasPin: false` on every failure, and that default is chosen rather than
     * convenient.
     *
     * This drives a settings row that offers either "Set a PIN" or
     * "Change / Remove". Defaulting the other way — assuming a PIN exists
     * because the check failed — would offer Remove for something that may not
     * be there and hide the only action that helps. Under-claiming is the safe
     * direction for a credential the caller cannot see.
     *
     * It does NOT gate the lock screen; `verifyStaffPin` answers that
     * separately, and it fails closed.
     */
    try {
      const { data, error } = await supabase.rpc('staff_pin_status')
      if (error || !data) return { hasPin: false }

      const status = data as Record<string, unknown>
      return {
        hasPin: status['has_pin'] === true,
        setAt: (status['set_at'] as string | null) ?? null,
        lockedUntil: (status['locked_until'] as string | null) ?? null,
        lastUsedAt: (status['last_used_at'] as string | null) ?? null,
      }
    } catch {
      return { hasPin: false }
    }
  }, [])

  const revokeOwnStaffPin = useCallback(async () => {
    if (IS_MOCK) {
      return { error: 'Removing a PIN needs the live Supabase project (VITE_DATA_SOURCE=mock).' }
    }
    try {
      const { error } = await supabase.rpc('revoke_own_staff_pin')
      // Keeps `hasPin` — and therefore the idle branch between lock and
      // sign-out — correct without waiting for the next status read.
      if (!error) setHasPin(false)
      return { error: error ? error.message : null }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'The PIN could not be removed.' }
    }
  }, [])

  /**
   * Kept synchronous-looking because existing call sites (`Header`,
   * `HandoverSheet`) call it and then navigate in the same tick. Clearing local
   * state immediately is the honest behaviour — the network sign-out that
   * follows cannot fail in a way that should keep the session on screen.
   */
  const logout = useCallback(() => {
    setUser(null)
    setLocked(false)
    setPasswordRecovery(false)
    setHasPin(false)
    void supabase.auth.signOut()
    /*
     * Law 6 — the identity is leaving the device, so its rows must leave with
     * it. Workbox keys its two PostgREST caches on URL alone, so without this an
     * Owner's cached booking bodies (deposit_paisa, total_paisa) are served by
     * NetworkFirst to the money-blind user who signs in next on the same
     * warehouse tablet, where RLS can no longer reach them. The outbox is
     * deliberately spared — see `devicePurge.ts`.
     *
     * Fire-and-forget for the same reason `signOut()` is: this function is
     * called and then navigated away from in the same tick, and a sign-out must
     * never be blocked by a cache API.
     */
    void purgeDeviceReadCaches()
  }, [])

  /*
   * ── the lock trigger ──────────────────────────────────────────────────────
   *
   * Added 24 Aug 2026. Until then NOTHING in the app ever called
   * `setLocked(true)`: `App.tsx` rendered `ScreenLock` when `isLocked` and
   * cleared it on unlock, `HandoverSheet` called `logout()` rather than locking,
   * and `sessionTimeoutMinutes` — an editable, persisted setting reading
   * "Signed out after this long idle" — was read by no code at all. So the
   * screen lock was unreachable and the timeout was decoration.
   *
   * ## It locks. It never signs out. And it is OFF unless switched on.
   *
   * **Ruled by the owner, 25 Aug 2026**, overriding the sign-out fallback this
   * comment used to argue for. Two rules, both load-bearing:
   *
   *   1. **The idle lock is OFF by default.** `sessionTimeoutMinutes` stores `0`
   *      for off, and an absent/NaN/nonsense value is read as off too. The
   *      failure direction matters: a misread setting must not start
   *      interrupting people who never asked for it.
   *   2. **The PIN re-locks the screen; nothing here ever calls `logout()`.**
   *      With no PIN there is nothing to unlock with, so the timer does nothing
   *      at all rather than signing the operator out.
   *
   * The earlier reasoning — that a PIN-less session "cannot be reopened, so
   * locking would strand the operator at a curtain whose only exit is the
   * sign-out they were going to get anyway" — is sound about the curtain and
   * wrong about the cost. A packer signed out mid-Handover loses the session's
   * work; an unlocked screen in a warehouse does not. Given that trade the owner
   * ruled for the unlocked screen.
   *
   * This was not academic. `staffPinStatus()` returns `hasPin: false` whenever
   * the PIN RPCs are missing, which is the case on the live project today
   * (`0066`–`0068` are unapplied). Shipping the old branch would have signed
   * every production user out after 30 idle minutes — a behaviour nobody has
   * today, arriving with no lock screen and no Lock button.
   *
   * ## A timestamp plus one interval, not a timer per event
   *
   * Re-arming a `setTimeout` on every `mousemove` is thousands of timer
   * operations a minute on a page an operator is actively using. Recording a
   * number is free, and one 15-second interval does the comparison.
   *
   * It also behaves correctly when the tab is backgrounded, which the timer
   * approach does not: browsers throttle timers in hidden tabs, so a 30-minute
   * `setTimeout` can fire late or not at all. Comparing wall-clock time means a
   * tablet asleep for an hour locks on the first check after it wakes.
   */
  /*
   * Whether this session holds a PIN, resolved once per identity.
   *
   * The lock trigger below has to know BEFORE the timeout fires — asking at
   * that moment would mean an await between "idle" and "locked", and a failed
   * lookup there would have to choose between locking someone out of a session
   * they can reopen and leaving an idle tablet open. Resolving it up front makes
   * the timeout branch synchronous and certain.
   */
  useEffect(() => {
    if (!user) {
      setHasPin(false)
      return
    }
    let cancelled = false
    void staffPinStatus().then((status) => {
      if (!cancelled) setHasPin(status.hasPin)
    })
    return () => {
      cancelled = true
    }
  }, [user, staffPinStatus])

  const lastActivityAt = useRef(Date.now())

  const lockNow = useCallback(() => {
    if (!hasPin) return
    setLocked(true)
  }, [hasPin])

  useEffect(() => {
    // Nothing to lock when signed out, and no point re-arming while the curtain
    // is already drawn.
    if (!user || isLocked) return

    const minutes = Number(getSetting('sessionTimeoutMinutes'))
    // 0 is how the store spells "off", and off is the default (ruled 25 Aug
    // 2026). Anything unreadable is treated as off for the same reason: this
    // reads a value a user can edit, and the safe direction for a misread is
    // "do not start locking people out", not "fall back to 30 minutes".
    if (!Number.isFinite(minutes) || minutes < 1) return
    const timeoutMs = minutes * 60_000

    const note = () => {
      lastActivityAt.current = Date.now()
    }

    const EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const
    for (const e of EVENTS) window.addEventListener(e, note, { passive: true })

    const id = window.setInterval(() => {
      if (Date.now() - lastActivityAt.current < timeoutMs) return
      // Lock only. No `logout()` branch — see the ruling above. A PIN-less
      // session simply keeps running; the alternative loses a packer's work.
      if (hasPin) setLocked(true)
    }, 15_000)

    // Start the clock from now rather than from whenever the last event was, so
    // enabling the lock does not immediately fire on a stale timestamp.
    note()

    return () => {
      window.clearInterval(id)
      for (const e of EVENTS) window.removeEventListener(e, note)
    }
  }, [user, isLocked, hasPin, logout])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        requestPasswordReset,
        updatePassword,
        isPasswordRecovery,
        logout,
        isLocked,
        setLocked,
        lockNow,
        hasPin,
        setStaffPin,
        verifyStaffPin,
        staffPinStatus,
        revokeOwnStaffPin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

const FALLBACK_AUTH_CONTEXT: AuthContextType = {
  user: null,
  loading: true,
  signIn: async () => ({ error: 'Auth not initialized' }),
  requestPasswordReset: async () => ({ error: 'Auth not initialized' }),
  updatePassword: async () => ({ error: 'Auth not initialized' }),
  isPasswordRecovery: false,
  logout: () => {},
  isLocked: false,
  setLocked: () => {},
  lockNow: () => {},
  hasPin: false,
  setStaffPin: async () => ({ error: 'Auth not initialized' }),
  verifyStaffPin: async () => ({ ok: false, reason: 'unavailable', message: 'Auth not initialized' }),
  staffPinStatus: async () => ({ hasPin: false }),
  revokeOwnStaffPin: async () => ({ error: 'Auth not initialized' }),
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    if (import.meta.env.DEV) {
      console.warn('[useAuth] Called outside AuthProvider or during HMR re-evaluation. Returning fallback loading state.')
    }
    return FALLBACK_AUTH_CONTEXT
  }
  return context
}
