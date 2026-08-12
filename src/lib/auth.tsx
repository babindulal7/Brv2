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
