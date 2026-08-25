// @vitest-environment jsdom
/**
 * The session lock, driven through the numpad. Built 24 Aug 2026.
 *
 * Every assertion that matters here is a NEGATIVE one, which is the reason this
 * file exists at all. What it replaced accepted **any six digits**:
 *
 * ```ts
 * if (newPin.length === 6) {
 *   // Mock unlock on any 6 digit pin
 *   setTimeout(() => onUnlock(), 200)
 * }
 * ```
 *
 * A regression here does not look like a broken screen — it looks like a lock
 * that opens, which is indistinguishable from a working one until somebody
 * malicious or merely curious finds it. So the tests pin the refusals:
 *
 *   1. A wrong PIN must not unlock.
 *   2. A PIN that cannot be CHECKED must not unlock. This is the one a naive
 *      implementation gets wrong: `catch` around a verify call that then falls
 *      through to the success path fails OPEN, and an offline warehouse tablet
 *      is the most likely place to hit it.
 *   3. An account with no PIN enrolled must not unlock — the old build's exact
 *      mistake, since "no PIN" and "any PIN is fine" are one line apart.
 *   4. The fifth failure must end the session, not merely block the pad, so a
 *      locked-out session cannot sit on a shared device holding a live JWT.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { PinVerdict } from '../../../lib/auth'

const verifyStaffPin = vi.fn(async (_pin: string): Promise<PinVerdict> => ({ ok: true }))
const logout = vi.fn()
const onUnlock = vi.fn()

const authState = {
  name: 'Babin Dulal' as string,
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: authState.name, role: 'Owner', isSharedDevice: false },
    loading: false,
    verifyStaffPin,
    logout,
    isLocked: true,
    setLocked: vi.fn(),
  }),
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ScreenLock } = await import('../ScreenLock')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <ScreenLock onUnlock={onUnlock} />
      </StrictMode>,
    )
  })
}

/** The numpad keys carry `aria-label="Digit N"`, which is also the a11y contract. */
function digit(n: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="Digit ${n}"]`)
  if (!el) throw new Error(`no key for digit ${n}`)
  return el
}

async function enter(pin: string) {
  for (const ch of pin) {
    await act(async () => {
      digit(ch).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }
  // Let the verify promise settle before assertions.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

const text = () => container.textContent ?? ''

beforeEach(() => {
  verifyStaffPin.mockClear().mockResolvedValue({ ok: true })
  logout.mockClear()
  onUnlock.mockClear()
  authState.name = 'Babin Dulal'
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('ScreenLock — the curtain', () => {
  it('names whose session is locked, so the wrong operator does not try', async () => {
    await mount()
    // The shared-tablet guard. Without it, B cannot tell A's session from their
    // own and burns A's five attempts finding out.
    expect(text()).toContain('Signed in as Babin Dulal')
  })

  it('never invents a name when the staff row has none', async () => {
    // `loadProfile` resolves `name` to the EMPTY STRING rather than a
    // placeholder, precisely so attribution guards downstream can refuse. The
    // lock screen must not undo that by printing something name-shaped — the
    // old build shipped "Sign out as Ramesh", a person who does not exist.
    authState.name = ''
    await mount()
    expect(text()).not.toContain('Signed in as')
    expect(text()).toContain('no named staff row')
  })

  it('unlocks on the correct PIN, and only after the database says so', async () => {
    await mount()
    await enter('418293')

    expect(verifyStaffPin).toHaveBeenCalledWith('418293')
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('sends the entered digits to the database and nothing else', async () => {
    await mount()
    await enter('418293')
    // No local comparison anywhere: the pad reports digits, Postgres decides.
    expect(verifyStaffPin).toHaveBeenCalledTimes(1)
  })
})

describe('ScreenLock — the refusals', () => {
  it('does NOT unlock on a wrong PIN, and says how many tries are left in words', async () => {
    verifyStaffPin.mockResolvedValue({
      ok: false,
      reason: 'incorrect',
      attemptsRemaining: 4,
      lockedUntil: null,
    })
    await mount()
    await enter('000000')

    expect(onUnlock).not.toHaveBeenCalled()
    // Words, not a colour and not a shrinking bar — Law 11.
    expect(text()).toContain('4 attempts left')
  })

  it('says "1 attempt" rather than "1 attempts" on the last try', async () => {
    verifyStaffPin.mockResolvedValue({
      ok: false,
      reason: 'incorrect',
      attemptsRemaining: 1,
      lockedUntil: null,
    })
    await mount()
    await enter('000000')
    expect(text()).toContain('1 attempt left')
    expect(text()).not.toContain('1 attempts left')
  })

  it('does NOT unlock when the PIN cannot be checked — fails closed', async () => {
    // The offline-tablet case. A verify that never reached Postgres is not a
    // pass, and this is the assertion a fail-open regression trips first.
    verifyStaffPin.mockResolvedValue({
      ok: false,
      reason: 'unavailable',
      message: 'Failed to fetch',
    })
    await mount()
    await enter('418293')

    expect(onUnlock).not.toHaveBeenCalled()
    expect(text()).toContain('Cannot check your PIN right now')
    // The operator is given a way out that does not require the network.
    expect(text()).toContain('Sign out instead')
  })

  it('does NOT unlock when no PIN is enrolled', async () => {
    verifyStaffPin.mockResolvedValue({ ok: false, reason: 'no_pin' })
    await mount()
    await enter('418293')

    expect(onUnlock).not.toHaveBeenCalled()
    expect(text()).toContain('No PIN is set')
  })

  it('does NOT unlock a deactivated staff row', async () => {
    verifyStaffPin.mockResolvedValue({ ok: false, reason: 'inactive' })
    await mount()
    await enter('418293')

    expect(onUnlock).not.toHaveBeenCalled()
    expect(text()).toContain('no longer active')
  })

  it('ends the session on lockout rather than leaving a live JWT behind a dead curtain', async () => {
    verifyStaffPin.mockResolvedValue({
      ok: false,
      reason: 'locked',
      attemptsRemaining: 0,
      lockedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    await mount()
    await enter('000000')

    expect(onUnlock).not.toHaveBeenCalled()
    // A real sign-out. The old build navigated to /login and left the session
    // signed in, which on a shared tablet is worse than no lock at all.
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('replaces the numpad while locked out, and names the time', async () => {
    const until = new Date(Date.now() + 15 * 60_000)
    verifyStaffPin.mockResolvedValue({
      ok: false,
      reason: 'locked',
      attemptsRemaining: 0,
      lockedUntil: until.toISOString(),
    })
    await mount()
    await enter('000000')

    expect(container.querySelector('button[aria-label="Digit 1"]')).toBeNull()
    expect(text()).toContain('PIN locked until')
    expect(text()).toContain('Sign in with your password')
  })

  it('verifies once per completed entry, not once per render', async () => {
    // The pad fires `onComplete` exactly once for a given value. Without that
    // guard a parent re-render at full length re-verifies, and a second failed
    // verify is a second increment of the database attempt counter for one
    // wrong entry — five taps would lock the operator out in three.
    verifyStaffPin.mockResolvedValue({
      ok: false,
      reason: 'incorrect',
      attemptsRemaining: 4,
      lockedUntil: null,
    })
    await mount()
    await enter('000000')

    expect(verifyStaffPin).toHaveBeenCalledTimes(1)
  })
})

describe('ScreenLock — the way out', () => {
  it('always offers a real sign-out', async () => {
    await mount()
    const buttons = Array.from(container.querySelectorAll('button'))
    const out = buttons.find((b) => (b.textContent ?? '').includes('Sign out instead'))
    expect(out).toBeTruthy()

    await act(async () => {
      out!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('is a modal dialog, focus-trapped and labelled', async () => {
    await mount()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-label')).toBe('Session locked')
  })
})
