import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'

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

interface AuthContextType {
  user: AuthUser | null
  /**
   * True until the very first session lookup resolves. `Shell` must not bounce
   * to /login while this is true, or every page refresh flashes the login screen
   * before the restored session lands.
   */
  loading: boolean
  /**
   * A `user` is set and there is **no Supabase session behind it** — one of the
   * two dev doors. Every query goes out as `anon`, RLS denies it, and the app
   * renders a full header over empty lists.
   *
   * This is state rather than a `console.warn` because the warning was not
   * enough. On 12 Aug 2026 a session with 120 seeded bookings read as an empty
   * database through this exact door, twice, and both times the conclusion was
   * "the seed failed" — the screens were correct, the session was not. The whole
   * failure is invisible: 200s, no errors, plausible empty states. Something has
   * to say so ON THE SCREEN, and `SessionlessBanner` is what reads this.
   */
  sessionless: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => void
  isLocked: boolean
  setLocked: (locked: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * TEMPORARY DEV BYPASS — requested 11 Aug 2026 to unblock browser verification
 * while the Owner's bootstrap password is unavailable. NOT a decision about
 * auth; the real Supabase path below is untouched and resumes the moment the
 * flag is off.
 *
 * Double-gated on purpose. `import.meta.env.DEV` is statically `false` in a
 * `vite build`, so this whole branch is dead code the bundler drops — setting
 * the env var in a deployed environment cannot revive it. That is the property
 * that makes this safe to leave in the tree: the previous mock session (removed
 * 11 Aug) had no such gate, which is exactly why every visitor was an Owner.
 *
 * Turn off by deleting `VITE_DEV_AUTH_BYPASS` from `.env.local` and restarting
 * Vite — env vars are read at server start, not per request.
 */
const DEV_AUTH_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'

/**
 * The credential fallback in `signIn` (below) is gated SEPARATELY, and the
 * asymmetry is deliberate — do not "tidy" this back into one flag.
 *
 * The two dev doors have different risk profiles:
 *
 *  - `DEV_AUTH_BYPASS` signs you in as Owner with **no credentials at all**,
 *    on page load, for anyone who can reach the dev server. That needs an
 *    explicit opt-in flag, and it has one.
 *  - The credential fallback requires knowing a specific email **and** a
 *    password. Nobody arrives at an Owner session by accident.
 *
 * They were briefly collapsed onto `DEV_AUTH_BYPASS` on 12 Aug 2026, on the
 * reasoning that one uncontrolled door was worse than two controlled ones.
 * That was wrong in an instructive way: `VITE_DEV_AUTH_BYPASS` is commented out
 * in `.env.local`, so the only way to restore password sign-in became turning on
 * the door that needs no password. A gate that can only be opened by removing a
 * stronger gate is not a gate.
 *
 * Both remain `import.meta.env.DEV`, which `vite build` statically replaces with
 * `false`, so the bundler drops both branches from a production build. That —
 * not the env flag — is what makes either safe to leave in the tree.
 */
const DEV_CREDENTIAL_FALLBACK = import.meta.env.DEV

/**
 * The real seeded Owner (EMP-001), not an invented identity — `id` matches
 * `public.users.id` so anything keyed on the actor stamps a row that exists.
 */
const DEV_BYPASS_USER: AuthUser = {
  id: '00000000-0000-0000-0000-000000000101',
  name: 'Babin Shrestha',
  role: 'Owner' as Role,
  isSharedDevice: false,
}

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
  /** See `AuthContextType.sessionless`. Set only by the two dev doors. */
  const [sessionless, setSessionless] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isLocked, setLocked] = useState(false)

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

    if (error || !data) {
      // Authenticated against Supabase but carrying no staff row — a real state
      // (an auth user created outside the staff table). Deliberately NOT
      // defaulted to a working role: an unknown identity gets `Client`, the
      // portal-only role every staff policy already excludes.
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

    // Sign the seeded Owner straight in and never touch Supabase Auth. Loud on
    // purpose: a silent bypass is indistinguishable from working auth, which is
    // how the old mock session survived unnoticed for as long as it did.
    if (DEV_AUTH_BYPASS) {
      console.warn(
        '[auth] DEV BYPASS ACTIVE — signed in as Owner without credentials. ' +
          'Real Supabase Auth is skipped. Remove VITE_DEV_AUTH_BYPASS from .env.local to restore it.',
      )
      setUser(DEV_BYPASS_USER)
      setSessionless(true)
      setLoading(false)
      return
    }

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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
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

  const signIn = useCallback(async (email: string, password: string) => {
    /*
     * DEV CREDENTIAL FALLBACK — the second door into the same seeded Owner
     * session (`babindulal7@gmail.com` / `owner@babinrentals.com`, password
     * `123` or `123123`). Kept on purpose; it is a real convenience.
     *
     * Gated on `DEV_CREDENTIAL_FALLBACK` (= `import.meta.env.DEV`), separately
     * from `DEV_AUTH_BYPASS`. See the block on that constant for why the two are
     * deliberately NOT one flag — briefly: this door needs an email and a
     * password, the other needs nothing, and collapsing them made restoring this
     * one require opening that one.
     *
     * ⚠⚠ THE IMPORTANT PART, IF YOU ARE ABOUT TO USE THIS TO "VERIFY" ANYTHING.
     *
     * This does NOT give you a session the database will answer. It sets the
     * React `user` to Owner and never signs in to Supabase, so there is no JWT.
     * Every query goes out as `anon`, RLS correctly denies it, and screens
     * render EMPTY under a header that says "Owner".
     *
     * That is why `VITE_DEV_AUTH_BYPASS` was commented out on 11 Aug 2026
     * (`.env.local:16-22` records it): an empty table is indistinguishable from
     * "no data", so the bypass produces exactly the false-negative this codebase
     * has spent two days removing from its screens.
     *
     * So: this door is fine for driving LAYOUT, gating and refusal paths — which
     * roles see which controls, whether a button refuses, whether an inline error
     * renders. It is worthless for verifying that data arrives, and a screen that
     * looks empty under it has proved nothing. Real Supabase credentials are the
     * only way to hold a session RLS will answer.
     */
    if (
      DEV_CREDENTIAL_FALLBACK &&
      (email.toLowerCase() === 'babindulal7@gmail.com' || email.toLowerCase() === 'owner@babinrentals.com') &&
      (password === '123' || password === '123123')
    ) {
      // Loud for the same reason the bypass above is loud: a silent dev door is
      // indistinguishable from working auth.
      console.warn(
        '[auth] DEV CREDENTIAL FALLBACK — signed in as Owner without contacting Supabase Auth. ' +
          'There is no JWT, so every query runs as `anon` and RLS will return empty results.',
      )
      setUser(DEV_BYPASS_USER)
      setSessionless(true)
      return { error: null }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // onAuthStateChange populates `user`; only the failure path is reported here.
    return { error: error ? error.message : null }
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
    void supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, sessionless, signIn, logout, isLocked, setLocked }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
