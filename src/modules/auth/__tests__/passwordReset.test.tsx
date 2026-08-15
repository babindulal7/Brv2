// @vitest-environment jsdom
/**
 * Password reset, driven through the two screens. Built 15 Aug 2026.
 *
 * The assertion that matters most here is a NEGATIVE one, and it is the reason
 * this file exists rather than a couple of smoke tests:
 *
 *   **`ForgotPassword` must never tell the operator an email was sent.**
 *
 * `supabase.auth.resetPasswordForEmail` resolves with no error whether or not
 * the address has an account — deliberately, so the form cannot be used to
 * enumerate staff accounts. A screen that renders "Check your inbox" off that
 * result is asserting something it has no way to know, which is precisely the
 * class of defect `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` was opened to
 * close. The wording is therefore pinned, not just the behaviour: a future edit
 * that "improves" the copy into a confident sentence fails here.
 *
 * The second is `ResetPassword`'s gate. `updateUser({ password })` succeeds for
 * ANY live session, so gating on `user` would quietly turn `/reset-password`
 * into a change-password screen reachable from any unlocked desk. It gates on
 * `isPasswordRecovery`, which only Supabase's `PASSWORD_RECOVERY` event sets.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const requestPasswordReset = vi.fn(async (_email: string) => ({ error: null as string | null }))
const updatePassword = vi.fn(async (_password: string) => ({ error: null as string | null }))
const navigate = vi.fn()

const authState = {
  isPasswordRecovery: false,
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn: vi.fn(),
    requestPasswordReset,
    updatePassword,
    isPasswordRecovery: authState.isPasswordRecovery,
    logout: vi.fn(),
    isLocked: false,
    setLocked: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

/* `Unavailable` reads `lib/device`, which subscribes to media queries on mount.
   jsdom ships no `matchMedia` — same stub the AddClient suites use. */
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

const { default: ForgotPassword } = await import('../ForgotPassword')
const { default: ResetPassword } = await import('../ResetPassword')

let container: HTMLDivElement
let root: Root

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <MemoryRouter>{node}</MemoryRouter>
      </StrictMode>,
    )
  })
}

function byId(id: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`#${id}`)
  if (!el) throw new Error(`no input #${id}`)
  return el
}

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit() {
  const btn = container.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!btn) throw new Error('no submit button')
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

const text = () => container.textContent ?? ''

beforeEach(() => {
  requestPasswordReset.mockClear().mockResolvedValue({ error: null })
  updatePassword.mockClear().mockResolvedValue({ error: null })
  navigate.mockClear()
  authState.isPasswordRecovery = false
  window.location.hash = ''
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

/* ── ForgotPassword ─────────────────────────────────────────────────────── */

describe('ForgotPassword — asks for a link', () => {
  it('refuses an empty address and sends nothing', async () => {
    await mount(<ForgotPassword />)
    await submit()

    expect(requestPasswordReset).not.toHaveBeenCalled()
    expect(text()).toMatch(/Enter the work email/i)
  })

  it('sends the trimmed address', async () => {
    await mount(<ForgotPassword />)
    await type(byId('reset-email'), '  babindulal7@gmail.com  ')
    await submit()

    expect(requestPasswordReset).toHaveBeenCalledWith('babindulal7@gmail.com')
  })

  /*
   * THE ONE THAT MATTERS. Supabase answers identically for an address with no
   * account, so any sentence asserting delivery is unverifiable by construction.
   */
  it('never claims an email was sent — the confirmation stays conditional', async () => {
    await mount(<ForgotPassword />)
    await type(byId('reset-email'), 'someone@example.com')
    await submit()

    const shown = text()
    // What it MUST say: the condition.
    expect(shown).toMatch(/if\s+someone@example\.com\s+has an account/i)
    // What it must NOT say: any assertion that delivery happened.
    expect(shown).not.toMatch(/we('ve| have)? sent/i)
    expect(shown).not.toMatch(/check your inbox/i)
    expect(shown).not.toMatch(/email sent/i)
  })

  it('shows a server refusal inline and withholds the confirmation entirely', async () => {
    requestPasswordReset.mockResolvedValue({
      error: 'For security purposes, you can only request this after 51 seconds.',
    })
    await mount(<ForgotPassword />)
    await type(byId('reset-email'), 'babindulal7@gmail.com')
    await submit()

    expect(text()).toMatch(/only request this after 51 seconds/i)
    // A rate-limited request sent nothing, so the conditional notice is wrong too.
    expect(text()).not.toMatch(/has an account/i)
  })
})

/* ── ResetPassword ──────────────────────────────────────────────────────── */

describe('ResetPassword — the gate', () => {
  it('refuses when there is no recovery session, and renders no password field', async () => {
    authState.isPasswordRecovery = false
    await mount(<ResetPassword />)

    expect(text()).toMatch(/only works when you arrive from a password-reset email/i)
    expect(container.querySelector('#new-password')).toBeNull()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('states an expired link in words rather than the generic refusal', async () => {
    authState.isPasswordRecovery = false
    window.location.hash = '#error=access_denied&error_code=otp_expired'
    await mount(<ResetPassword />)

    expect(text()).toMatch(/expired/i)
  })
})

describe('ResetPassword — with a recovery session', () => {
  beforeEach(() => {
    authState.isPasswordRecovery = true
  })

  it('refuses two passwords that do not match, before calling Supabase', async () => {
    await mount(<ResetPassword />)
    await type(byId('new-password'), 'correct-horse-battery')
    await type(byId('confirm-password'), 'correct-horse-batteries')
    await submit()

    expect(updatePassword).not.toHaveBeenCalled()
    expect(text()).toMatch(/do not match/i)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('refuses when either field is empty', async () => {
    await mount(<ResetPassword />)
    await type(byId('new-password'), 'correct-horse-battery')
    await submit()

    expect(updatePassword).not.toHaveBeenCalled()
    expect(text()).toMatch(/twice/i)
  })

  /*
   * Deliberate: password strength is a project setting on Supabase, and a second
   * rule in the client would be the copy nobody updates. A short password is
   * SENT, and the server's refusal is what the operator reads.
   */
  it('does not invent a minimum length — a short password reaches the server', async () => {
    updatePassword.mockResolvedValue({ error: 'Password should be at least 6 characters.' })
    await mount(<ResetPassword />)
    await type(byId('new-password'), 'abc')
    await type(byId('confirm-password'), 'abc')
    await submit()

    expect(updatePassword).toHaveBeenCalledWith('abc')
    expect(text()).toMatch(/at least 6 characters/i)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('sets the password and lands the operator on /today', async () => {
    await mount(<ResetPassword />)
    await type(byId('new-password'), 'correct-horse-battery')
    await type(byId('confirm-password'), 'correct-horse-battery')
    await submit()

    expect(updatePassword).toHaveBeenCalledWith('correct-horse-battery')
    expect(navigate).toHaveBeenCalledWith('/today', { replace: true })
  })
})
