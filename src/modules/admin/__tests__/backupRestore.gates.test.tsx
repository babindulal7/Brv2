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

/**
 * One completed backup in the live query's vocabulary (`backup_logs`,
 * 0007:295-310) so the history table has a row to hang its gated actions on.
 * The query seam is mocked at the same boundary the other converted screens'
 * suites mock it; `backupRestriction` and the reason strings stay real.
 */
const BACKUP_FIXTURES = [
  {
    id: 'bk-1',
    backupNo: 'BKP-2026-0142',
    backupType: 'Full',
    status: 'Completed',
    storageLocation: 'supabase-storage://backups/2026-08-20',
    fileSizeBytes: 734_003_200,
    startedAtAd: '2026-08-20T00:30:00.000Z',
    completedAtAd: '2026-08-20T00:52:00.000Z',
    initiatedBy: '22222222-2222-4222-8222-222222222222',
    errorMessage: null,
  },
]

vi.mock('../../../lib/queries/backup', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/backup')>()),
  listBackupLogs: async () => ({ rows: BACKUP_FIXTURES, total: BACKUP_FIXTURES.length }),
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
  /* The history resolves `listBackupLogs` in an effect — the same flush the
     BookingDetail suites use to let the mocked read land. */
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
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
  it('parks Start Restore as a stated absence — the theatre flow is retired, its protections named', async () => {
    /*
     * The seed build's Owner-only branch opened `SystemRestoreModal`, whose
     * checkpoint was a 2-second timer and whose 2FA compared a code against
     * nothing but its own length. The 21 Aug conversion removed that flow
     * rather than pointing it at a service that does not exist — so what is
     * pinned now is the honest replacement: no live restore control for ANY
     * role (Owner included), no dialog, and the §7 protections (Owner-only,
     * 2FA, sandbox default, mandatory checkpoint) stated on the page as the
     * contract the real service must arrive with.
     */
    await mount()
    expect(liveActions().filter((b) => /restore/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))).toHaveLength(0)

    const start = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Start Restore'))
    expect(start).toBeUndefined()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    /* The protections stay written down where the control is parked. */
    const text = container.textContent ?? ''
    expect(text).toContain('sandbox as the default')
    expect(text).toContain('pre-restore checkpoint')

    const reasons = [...container.querySelectorAll('[aria-disabled]')].map((n) => n.getAttribute('aria-label') ?? '')
    expect(reasons.some((r) => r.includes('No restore service exists in this build'))).toBe(true)
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
