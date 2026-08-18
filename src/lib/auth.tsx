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
      console.error(
        `[auth] Could not re-read the staff row for ${authId}; keeping the previously resolved ` +
          `identity rather than assuming a role. ${error.message}`,
      )
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
    void supabase.auth.signOut()
  }, [])

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
      }}
    >
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
