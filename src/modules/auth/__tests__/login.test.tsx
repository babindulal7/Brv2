// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Login from '../Login'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const signIn = vi.fn(async (_email: string, _password: string) => ({ error: null as string | null }))
const navigate = vi.fn()

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn,
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    isPasswordRecovery: false,
    logout: vi.fn(),
    isLocked: false,
    setLocked: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

describe('Login component', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    signIn.mockClear()
    navigate.mockClear()
    localStorage.clear()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders email input, password input, remember email checkbox, and sign-in button', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const emailInput = host.querySelector<HTMLInputElement>('#login-email')
    const passwordInput = host.querySelector<HTMLInputElement>('#login-password')
    const submitBtn = host.querySelector<HTMLButtonElement>('button[type="submit"]')
    const rememberCheckbox = host.querySelector<HTMLInputElement>('.auth-remember-checkbox')
    const forgotLink = host.querySelector<HTMLAnchorElement>('.auth-footer-link')

    expect(emailInput).not.toBeNull()
    expect(passwordInput).not.toBeNull()
    expect(submitBtn).not.toBeNull()
    expect(rememberCheckbox).not.toBeNull()
    expect(forgotLink).not.toBeNull()
    expect(forgotLink?.textContent).toContain('Forgot password?')
  })

  it('contains absolutely zero emojis anywhere in the rendered markup', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    expect(host.innerHTML).not.toMatch(emojiRegex)
  })

  it('prevents submission and displays persistent error when submitted with empty fields', async () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const form = host.querySelector<HTMLFormElement>('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(signIn).not.toHaveBeenCalled()
    const errorBanner = host.querySelector('#login-error')
    expect(errorBanner).not.toBeNull()
    expect(errorBanner?.textContent).toContain('Enter your work email and password.')
  })

  it('calls signIn and redirects on valid credentials', async () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const emailInput = host.querySelector<HTMLInputElement>('#login-email')!
    const passwordInput = host.querySelector<HTMLInputElement>('#login-password')!
    const form = host.querySelector<HTMLFormElement>('form')!

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      nativeSetter.call(emailInput, 'owner@babinrentals.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeSetter.call(passwordInput, 'validpass123')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(signIn).toHaveBeenCalledWith('owner@babinrentals.com', 'validpass123')
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('persists work email to localStorage when Remember email is checked', async () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const emailInput = host.querySelector<HTMLInputElement>('#login-email')!
    const passwordInput = host.querySelector<HTMLInputElement>('#login-password')!
    const rememberCheckbox = host.querySelector<HTMLInputElement>('.auth-remember-checkbox')!
    const form = host.querySelector<HTMLFormElement>('form')!

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      nativeSetter.call(emailInput, 'warehouse@babinrentals.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeSetter.call(passwordInput, 'validpass123')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
      rememberCheckbox.click()
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(localStorage.getItem('babin.auth.remember_email')).toBe('warehouse@babinrentals.com')
  })

  it('pre-populates remembered email from localStorage on mount', () => {
    localStorage.setItem('babin.auth.remember_email', 'remembered@babinrentals.com')

    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const emailInput = host.querySelector<HTMLInputElement>('#login-email')!
    const rememberCheckbox = host.querySelector<HTMLInputElement>('.auth-remember-checkbox')!

    expect(emailInput.value).toBe('remembered@babinrentals.com')
    expect(rememberCheckbox.checked).toBe(true)
  })

  it('detects and displays CapsLock warning when CapsLock key is engaged in password field', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      )
    })

    const passwordInput = host.querySelector<HTMLInputElement>('#login-password')!

    act(() => {
      passwordInput.focus()
      const event = new KeyboardEvent('keydown', { bubbles: true, key: 'A' })
      Object.defineProperty(event, 'getModifierState', {
        value: (key: string) => key === 'CapsLock',
      })
      passwordInput.dispatchEvent(event)
    })

    const capslockHint = host.querySelector('.auth-capslock-hint')
    expect(capslockHint).not.toBeNull()
    expect(capslockHint?.textContent).toContain('Caps Lock is ON')
  })
})
