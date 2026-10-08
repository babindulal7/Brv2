// @vitest-environment jsdom
/**
 * The idle lock actually fires. Built 24 Aug 2026.
 *
 * ## Why this test exists
 *
 * A real PIN lock screen shipped that day — hashed credential, five-attempt
 * lockout, fail-closed verification, fourteen tests of its own. It was
 * **unreachable**. `App.tsx` rendered `<ScreenLock>` when `isLocked` and cleared
 * it on unlock; nothing anywhere called `setLocked(true)`. `HandoverSheet` calls
 * `logout()`. And `sessionTimeoutMinutes` — an editable, persisted setting whose
 * own description reads "Signed out after this long idle" — was read by no code
 * in the application.
 *
 * That failure has no symptom. Every unit test passed, the screen worked when
 * driven directly, and the feature simply never appeared. A test that asserts
 * the *trigger* is the only thing that catches it, which is why this file is
 * separate from `screenLock.test.tsx`: that one proves the curtain works, this
 * one proves something draws it.
 *
 * ## The branch that matters
 *
 * Idle with a PIN → lock, because the session can be reopened in four taps.
 * Idle with no PIN → sign out, because locking would strand the operator behind
 * a credential they do not hold, and signing out is what the setting promises
 * anyway.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const db = vi.hoisted(() => {
  const state = {
    hasPin: true,
    signedOut: false,
    session: { user: { id: 'usr-owner', email: 'owner@example.com' } } as unknown,
  }
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'usr-owner', full_name: 'Babin Dulal', primary_role: 'Owner' },
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (name: string) => {
      if (name === 'staff_pin_status') {
        return { data: { has_pin: state.hasPin }, error: null }
      }
      return { data: null, error: null }
    },
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => {
        state.signedOut = true
        return {}
      },
    },
  }
  return { state, supabase }
})

vi.mock('../supabase', () => ({ supabase: db.supabase, newClientUuid: () => 'uuid', IS_MOCK: false }))

// A one-minute timeout keeps the fake-timer advance small and readable. The
// real default is 30; this test is about the mechanism, not the number.
vi.mock('../settingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settingsStore')>()),
  getSetting: (key: string) => (key === 'sessionTimeoutMinutes' ? 1 : ''),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { AuthProvider, useAuth } = await import('../auth')

let container: HTMLDivElement
let root: Root
let seen: { isLocked: boolean; hasPin: boolean; user: string | null } = {
  isLocked: false,
  hasPin: false,
  user: null,
}
let lockNow: (() => void) | null = null

function Probe() {
  const auth = useAuth()
  seen = { isLocked: auth.isLocked, hasPin: auth.hasPin, user: auth.user?.name ?? null }
  lockNow = auth.lockNow
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
  // Let the session lookup and the PIN-status read settle.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Push wall-clock past the timeout, then let the 15s poll observe it. */
async function goIdle(minutes: number) {
  await act(async () => {
    vi.advanceTimersByTime(minutes * 60_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  db.state.hasPin = true
  db.state.signedOut = false
  seen = { isLocked: false, hasPin: false, user: null }
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  vi.useRealTimers()
})

describe('idle lock — something draws the curtain', () => {
  it('resolves whether the session holds a PIN', async () => {
    await mount()
    expect(seen.user).toBe('Babin Dulal')
    expect(seen.hasPin).toBe(true)
    expect(seen.isLocked).toBe(false)
  })

  it('LOCKS an idle session that has a PIN', async () => {
    await mount()
    expect(seen.isLocked).toBe(false)

    await goIdle(2)

    expect(seen.isLocked).toBe(true)
    // Locked, not signed out — the JWT is retained so the PIN can reopen it.
    expect(db.state.signedOut).toBe(false)
    expect(seen.user).toBe('Babin Dulal')
  })

  /*
   * This test asserted the OPPOSITE until 25 Aug 2026 — "SIGNS OUT an idle
   * session that has no PIN, rather than stranding it". The owner overruled the
   * sign-out: a packer signed out mid-Handover loses the session's work, and an
   * unlocked warehouse screen does not. The invariant is kept rather than
   * deleted, inverted to pin the ruling, because the sign-out path is exactly
   * what must never come back — with `0066`-`0068` unapplied on live,
   * `staffPinStatus()` returns `hasPin: false` for EVERY production user, so a
   * regression here signs out the whole company at 30 minutes.
   */
  it('NEVER signs out a PIN-less idle session — it does nothing at all', async () => {
    db.state.hasPin = false
    await mount()
    expect(seen.hasPin).toBe(false)

    await goIdle(2)

    expect(db.state.signedOut).toBe(false)
    expect(seen.isLocked).toBe(false)
    // Still signed in, still working: the timer found no PIN and stood down.
    expect(seen.user).toBe('Babin Dulal')
  })

  it('does not lock a session that is still being used', async () => {
    await mount()

    // Half a timeout, a keystroke, then half again: activity resets the clock,
    // so the total elapsed exceeds the timeout but the idle span never does.
    await goIdle(0.6)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })
    await goIdle(0.6)

    expect(seen.isLocked).toBe(false)
    expect(db.state.signedOut).toBe(false)
  })

  it('offers lockNow, and it refuses when there is no PIN to reopen with', async () => {
    db.state.hasPin = false
    await mount()

    await act(async () => {
      lockNow?.()
    })

    // Refused rather than obeyed: locking here leaves "Sign out instead" as the
    // only exit, which is worse than not locking.
    expect(seen.isLocked).toBe(false)
  })

  it('lockNow draws the curtain when a PIN exists', async () => {
    await mount()

    await act(async () => {
      lockNow?.()
    })

    expect(seen.isLocked).toBe(true)
    expect(db.state.signedOut).toBe(false)
  })
})
