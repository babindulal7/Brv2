// @vitest-environment jsdom
/**
 * `loadProfile` must not answer "who is this session" from a failed request.
 *
 * ## The bug this pins, found 16 Aug 2026 by driving the app
 *
 * `loadProfile` ran `if (error || !data) → role: 'Client'`. Those are two
 * different facts. `!data` means "authenticated, but no staff row" — a real
 * state, correctly resolved to the portal-only role. `error` means the request
 * did not answer, which says nothing about the row and therefore nothing about
 * the role.
 *
 * It matters because `loadProfile` re-runs on EVERY `onAuthStateChange`,
 * including `TOKEN_REFRESHED` — roughly hourly. One failed re-read and the
 * signed-in Owner became a `Client`: the header changed from "Babin Dulal ·
 * Owner" to the bare email, and `/finance` told the owner of the business
 * "Access restricted. Your role (Client) does not have access to this module."
 * A page reload restored Owner, so it reads as a fluke rather than a defect —
 * which is exactly why it needs a test and not a comment.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const db = vi.hoisted(() => {
  const state = {
    /** What the `users` read returns. Overridden per test. */
    result: { data: null as unknown, error: null as { message: string } | null },
    /** The `onAuthStateChange` callback, so a test can fire TOKEN_REFRESHED. */
    listener: null as null | ((event: string, session: unknown) => void),
    session: { user: { id: 'usr-owner', email: 'owner@example.com' } } as unknown,
  }
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => state.result,
        }),
      }),
    }),
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({}),
    },
  }
  return { state, supabase }
})

vi.mock('../supabase', () => ({ supabase: db.supabase, newClientUuid: () => 'uuid' }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { AuthProvider, useAuth } = await import('../auth')

let container: HTMLDivElement
let root: Root
let seen: { role: string; name: string } | null = null

function Probe() {
  const { user } = useAuth()
  seen = user ? { role: user.role, name: user.name } : null
  return null
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
  })
}

const OWNER_ROW = { id: 'usr-owner', full_name: 'Babin Dulal', primary_role: 'Owner' }

beforeEach(() => {
  seen = null
  db.state.listener = null
  db.state.result = { data: OWNER_ROW, error: null }
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('loadProfile — a failed read is not an identity', () => {
  it('resolves the staff row on first load', async () => {
    await mount()
    expect(seen).toEqual({ role: 'Owner', name: 'Babin Dulal' })
  })

  /* THE REGRESSION. Owner in, request fails on refresh, Owner must remain. */
  it('keeps the resolved Owner when a token-refresh re-read fails', async () => {
    await mount()
    expect(seen?.role).toBe('Owner')

    db.state.result = { data: null, error: { message: 'Failed to fetch' } }
    await act(async () => {
      db.state.listener?.('TOKEN_REFRESHED', db.state.session)
    })

    expect(seen).toEqual({ role: 'Owner', name: 'Babin Dulal' })
  })

  it('does not invent a Client identity when the very first read fails', async () => {
    db.state.result = { data: null, error: { message: 'Failed to fetch' } }
    await mount()

    // `null` sends the shell to /login, which is honest. A `Client` here would
    // render a working-looking UI for an identity nobody resolved.
    expect(seen).toBeNull()
  })

  /* The branch that SHOULD still produce Client — authenticated, no staff row. */
  it('still resolves an authenticated user with no staff row to Client', async () => {
    db.state.result = { data: null, error: null }
    await mount()

    expect(seen?.role).toBe('Client')
    expect(seen?.name).toBe('owner@example.com')
  })

  it('recovers the real role when a later read succeeds again', async () => {
    db.state.result = { data: null, error: { message: 'Failed to fetch' } }
    await mount()
    expect(seen).toBeNull()

    db.state.result = { data: OWNER_ROW, error: null }
    await act(async () => {
      db.state.listener?.('TOKEN_REFRESHED', db.state.session)
    })

    expect(seen).toEqual({ role: 'Owner', name: 'Babin Dulal' })
  })
})
