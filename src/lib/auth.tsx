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
        name: fallbackEmail ?? 'Unknown user',
        role: 'Client' as Role,
        isSharedDevice: false,
      })
      return
    }

    setUser({
      id: data.id,
      name: data.full_name ?? fallbackEmail ?? 'Unknown user',
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
    // Dev credential fallback for testing with babindulal7@gmail.com / password 123
    if (
      import.meta.env.DEV &&
      (email.toLowerCase() === 'babindulal7@gmail.com' || email.toLowerCase() === 'owner@babinrentals.com') &&
      (password === '123' || password === '123123')
    ) {
      setUser(DEV_BYPASS_USER)
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
    <AuthContext.Provider value={{ user, loading, signIn, logout, isLocked, setLocked }}>
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
