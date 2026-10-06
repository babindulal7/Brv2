// @vitest-environment jsdom
/**
 * **A1 says "blocking". This is what that has to mean in the DOM.**
 *
 * The audit's A1 asks for a blocking banner "instead of failing mid-action".
 * Two things can go wrong and both were wrong in the first version:
 *
 *   * a **Dismiss** control, which lets the operator acknowledge the warning and
 *     then meet the missing-function error halfway through a Handover — the exact
 *     outcome the banner exists to prevent. `MockBanner` in `App.tsx` states the
 *     rule for this class of banner ("not dismissible, on every screen, at every
 *     width") and this one has to obey it too;
 *   * a **hardcoded migration range** in the copy, which was wrong from the moment
 *     it was written — the live ledger ends at `0089`, so the unapplied set starts
 *     well before the range it named — and cannot be kept true as files are added.
 *
 * The third case matters as much: when the check never reached the database the
 * banner has to say so, because "in sync" from a check that did not run is the
 * false all-clear a guard exists to prevent.
 *
 * `act` + `createRoot` rather than `@testing-library/react`, which this project
 * does not depend on — same as `shell.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const rpc = vi.fn()
const limit = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ select: () => ({ limit: (...args: unknown[]) => limit(...args) }) }),
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { SchemaGuardBanner } = await import('../SchemaGuardBanner')
const { __resetSchemaGuardCache } = await import('../../../lib/schemaGuard')

function pgError(code: string, message: string) {
  return { code, message, details: null, hint: null }
}

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<SchemaGuardBanner />)
  })
}

const alert = () => container.querySelector('[role="alert"]')
const buttons = () => Array.from(container.querySelectorAll('button'))
const byName = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))

beforeEach(() => {
  rpc.mockReset()
  limit.mockReset()
  __resetSchemaGuardCache()
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
})

describe('SchemaGuardBanner', () => {
  it('renders nothing when the schema is current', async () => {
    rpc.mockResolvedValue({ data: null, error: pgError('42501', 'permission denied') })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()

    expect(alert()).toBeNull()
  })

  it('names the migrations it probed, not a hardcoded range', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: pgError('PGRST202', 'Could not find the function public.read_quote_editor in the schema cache.'),
    })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()
    const text = container.textContent ?? ''

    expect(text).toContain('behind this build')
    // The summary carries what the operator acts on: which migrations, and what
    // stops working. Object names are one click away, in the details list.
    expect(text).toContain('0147')
    expect(text).toContain('quote editing')
    // No hardcoded range, and no hardcoded lower bound. The first version read
    // "applying migrations 0125–0147", which was wrong when written: the live
    // ledger ends at 0089, so the unapplied set starts well before 0125.
    expect(text).not.toMatch(/\d{4}\s*[–—-]\s*\d{4}/)
    expect(text).not.toContain('0125')
  })

  it('puts the probed object names behind the details toggle', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: pgError('PGRST202', 'Could not find the function public.read_quote_editor in the schema cache.'),
    })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()

    expect(container.textContent ?? '').not.toContain('read_quote_editor')
    const toggle = byName(/what is missing/i)
    await act(async () => {
      toggle?.click()
    })
    expect(container.textContent ?? '').toContain('read_quote_editor')
  })

  it('offers no way to dismiss it', async () => {
    rpc.mockResolvedValue({ data: null, error: pgError('PGRST202', 'Could not find the function.') })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()

    expect(byName(/dismiss/i)).toBeUndefined()
    expect(container.querySelector('[aria-label*="ismiss" i]')).toBeNull()
  })

  it('says it could not verify, rather than claiming the schema is current, when the check never landed', async () => {
    rpc.mockResolvedValue({ data: null, error: pgError('', 'TypeError: Failed to fetch') })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()
    const text = container.textContent ?? ''

    expect(text).toContain('Could not verify')
    // The dangerous half: a clean bill of health for a schema nobody asked about.
    expect(text).not.toMatch(/schema is current|up to date|in sync/i)
  })

  it('keeps the details list collapsed until asked, then expands it', async () => {
    rpc.mockResolvedValue({ data: null, error: pgError('PGRST202', 'Could not find the function.') })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()

    const toggle = byName(/what is missing/i)
    expect(toggle).toBeDefined()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('li')).toHaveLength(0)

    await act(async () => {
      toggle?.click()
    })

    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('li').length).toBeGreaterThan(0)
    expect(container.querySelector('li')?.textContent).toMatch(/014|015/)
  })

  it('meets the 44px touch-target floor on every control it renders', async () => {
    rpc.mockResolvedValue({ data: null, error: pgError('PGRST202', 'Could not find the function.') })
    limit.mockResolvedValue({ data: null, error: null })

    await mount()

    expect(buttons().length).toBeGreaterThan(0)
    for (const b of buttons()) {
      const minHeight = Number.parseFloat(b.style.minHeight || '0')
      expect(
        minHeight,
        `"${b.textContent}" has minHeight "${b.style.minHeight}"; the floor is 44px`,
      ).toBeGreaterThanOrEqual(44)
    }
  })
})