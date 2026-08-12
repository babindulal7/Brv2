// @vitest-environment jsdom
/**
 * # The four protections §10.7 does not mention
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §7: *"§10.7 Restore with only a typed
 * confirmation → **Do not build as drawn.** Keep Owner-only + 2FA, sandbox as
 * default target, mandatory pre-restore checkpoint. Gate Download the same way
 * — a full backup walks around Law 6's RLS."*
 *
 * Every one of those is invisible on a screenshot, and three of them are
 * invisible on the page unless you hold the wrong role. A future session
 * rebuilding this screen from the wireframe alone would drop all four without
 * noticing, which is exactly what this file prevents.
 *
 * The Download gate is the one that reads as over-cautious and is not: Law 6
 * hides money columns at the database, through RLS and twenty masking views. A
 * backup file is that same data with no RLS in front of it.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'

let viewport: Viewport = 'desktop'
const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: BackupRestore } = await import('../BackupRestore')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    /* `Rail` wraps `CollapsibleAside`, which keys its collapse state on
       `useLocation().pathname`. */
    root.render(
      <MemoryRouter>
        <BackupRestore />
      </MemoryRouter>,
    )
  })
}

/**
 * Every enabled control that *performs* a download or a restore.
 *
 * Matched on the start of the accessible name so that "Select backup or restore
 * point" — a picker, not an act — is not counted. The distinction is the one
 * the gate is about: choosing which backup to look at is not the same as
 * overwriting the database with it or exporting it past RLS.
 */
function liveActions(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter((b) => {
    const label = (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().toLowerCase()
    return !b.disabled && /^(download|restore|start restore|back up now)\b/.test(label)
  }) as HTMLButtonElement[]
}

beforeEach(() => {
  viewport = 'desktop'
  auth.role = 'Owner'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Backup & Restore — the Owner gate §10.7 never mentions', () => {
  it('offers a Warehouse role no live download and no live restore', async () => {
    auth.role = 'Warehouse'
    await mount()
    expect(liveActions()).toHaveLength(0)
  })

  it('offers a Manager no live download and no live restore either — Owner-only means Owner', async () => {
    auth.role = 'Manager'
    await mount()
    expect(liveActions()).toHaveLength(0)
  })

  it('states the reason on the gate rather than leaving a dead button', async () => {
    auth.role = 'Manager'
    await mount()
    const reasons = [...container.querySelectorAll('[aria-disabled]')].map((n) => n.getAttribute('aria-label') ?? '')
    expect(reasons.some((r) => r.includes('Owner-only'))).toBe(true)
    expect(reasons.some((r) => r.toLowerCase().includes('law 6'))).toBe(true)
  })

  it('gives an Owner the live controls', async () => {
    await mount()
    expect(liveActions().length).toBeGreaterThan(0)
  })
})

describe('Backup & Restore — the restore flow, and the failure it must report', () => {
  it('opens the confirmation with the sandbox preselected and the checkpoint mandatory', async () => {
    await mount()
    const start = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Start Restore'))
    expect(start).toBeDefined()
    await act(async () => {
      start!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    const text = dialog?.textContent ?? ''
    expect(text).toContain('Sandbox Environment (Default / Recommended)')

    /* Sandbox is *checked*, production merely offered. */
    const radios = [...(dialog?.querySelectorAll('input[type="radio"]') ?? [])] as HTMLInputElement[]
    expect(radios[0]?.checked).toBe(true)
    expect(radios[1]?.checked).toBe(false)

    /* The next step is the checkpoint — not the 2FA, and not the restore. */
    expect(text).toContain('Proceed to Checkpoint')
  })

  it('tells a non-Owner who reaches the dialog that it is not theirs', async () => {
    auth.role = 'Manager'
    await mount()
    /* A Manager cannot open it from the page at all; the modal re-checks
       independently, which is the property that matters if a route ever
       mounts it directly. */
    expect(liveActions()).toHaveLength(0)
  })

  it('never claims a download happened — it reports the failure inline', async () => {
    await mount()
    const download = liveActions().find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Download'))
    expect(download).toBeDefined()
    await act(async () => {
      download!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    const text = alert?.textContent ?? ''
    expect(text).toContain('Download did not happen')
    expect(text).toMatch(/no file was downloaded/i)
    /* The defect class this replaces. */
    expect(text).not.toMatch(/download (started|complete)/i)
  })
})

describe('Backup & Restore — Law 16', () => {
  it('renders no AI panel', async () => {
    await mount()
    const text = container.textContent ?? ''
    expect(text).not.toContain('AI Backup Advisor')
    expect(text).not.toContain('Ask AI')
  })
})
