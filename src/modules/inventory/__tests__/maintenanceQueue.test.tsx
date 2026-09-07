// @vitest-environment jsdom
/**
 * # Maintenance — the two halves of RS-09 on this screen
 *
 *  - **the row written twice.** One press of `Schedule Job` announces the job
 *    twice: `LogMaintenanceModal` awaits
 *    `DomainEvents.emit(MAINTENANCE_STARTED, payload)` — whose subscribers run
 *    synchronously — and then calls `onSuccess(payload)` with the same object.
 *    Both appended, so the queue held two rows under one `m.id`. Neither path
 *    reaches the database (`createMaintenanceJob` is `implemented: false` and
 *    the modal never calls it), so Law 8's unique-key rejection never runs and
 *    the screen is the only place the duplicate can be refused.
 *  - **the counts that disagreed with the list.** The KPI strip, the status
 *    chips and the flag pills all counted the frozen `MAINTENANCE_DATA` seed
 *    while the table rendered `recordsList`, so a job logged this session
 *    appeared in the table and in none of the figures above it.
 *
 * `Log Maintenance` is `disabled` inside `<Unavailable>` (RS-08), so the modal
 * cannot be opened from the UI; the job is announced through the event bus,
 * which is the same `upsertRecord` both notification paths now call.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => false }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** jsdom ships no `matchMedia`; `useViewport` and `useCapability` need it to exist. */
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

const { Maintenance } = await import('../Maintenance')
const { DomainEvents, EVENT_TYPES } = await import('../../../events/eventBus')

/** The three rows `MAINTENANCE_DATA` seeds — all three are in `ACTIVE_STATUSES`. */
const SEEDED = 3
const NEW_JOB = {
  id: 'MT-2026-9901',
  equipmentName: 'Aputure 600d Pro',
  serialNo: 'SN-AP-600',
  type: 'Repair' as const,
  priority: 'High' as const,
  technician: 'Babin Shrestha',
  estCompletionAd: '2026-09-20',
}

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Maintenance />
      </MemoryRouter>,
    )
  })
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ')

/** A status chip reads its label immediately followed by its count — `All3`. */
function chip(label: string): number {
  const re = new RegExp(`^${label}\\s*(\\d+)$`)
  for (const b of container.querySelectorAll('button')) {
    const m = re.exec((b.textContent ?? '').replace(/\s+/g, ' ').trim())
    if (m?.[1]) return Number(m[1])
  }
  throw new Error(`no "${label}" chip on screen`)
}

/** The value inside the KPI card whose own text carries `label`. */
function kpi(label: string): string {
  const card = [...container.querySelectorAll('article')].find((a) => (a.textContent ?? '').includes(label))
  if (!card) throw new Error(`no KPI card for "${label}"`)
  const m = /(\d+)/.exec((card.textContent ?? '').replace(label, ''))
  if (!m?.[1]) throw new Error(`no figure in the "${label}" card`)
  return m[1]
}

function rowsFor(id: string): number {
  return [...container.querySelectorAll('tbody tr')].filter((tr) => (tr.textContent ?? '').includes(id)).length
}

async function announce(job: typeof NEW_JOB) {
  await act(async () => {
    await DomainEvents.emit(EVENT_TYPES.MAINTENANCE_STARTED, job)
  })
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Maintenance — the strip, the chips and the table count one array', () => {
  it('opens with every figure agreeing with the seed', async () => {
    await mount()
    expect(chip('All')).toBe(SEEDED)
    expect(kpi('Active Maintenance')).toBe(String(SEEDED))
    /*
     * "seeded" is load-bearing, not decoration. It is the ONLY place this
     * screen admits the jobs are fabricated, and the CSV Export beside it is
     * live — so an operator can export seed rows into a real spreadsheet with
     * nothing having said so. The word was dropped while these counts were
     * being fixed and these assertions were written against the dropped
     * version; review caught the disclosure loss, the word came back, and the
     * assertions follow it. They pin the disclosure, not just the arithmetic.
     */
    expect(text()).toContain(`Showing ${SEEDED} of ${SEEDED} seeded jobs`)
  })

  it('moves the chips, the KPI strip and the footer with the list', async () => {
    await mount()
    await announce(NEW_JOB)

    expect(rowsFor(NEW_JOB.id)).toBe(1)
    expect(chip('All')).toBe(SEEDED + 1)
    // The new row is 'In Progress', which is one of ACTIVE_STATUSES.
    expect(kpi('Active Maintenance')).toBe(String(SEEDED + 1))
    expect(text()).toContain(`Showing ${SEEDED + 1} of ${SEEDED + 1} seeded jobs`)
  })
})

describe('Maintenance — the same job announced twice', () => {
  it('holds one row and one count for a job it is told about twice', async () => {
    await mount()
    await announce(NEW_JOB)
    await announce(NEW_JOB)

    expect(rowsFor(NEW_JOB.id)).toBe(1)
    expect(chip('All')).toBe(SEEDED + 1)
    expect(kpi('Active Maintenance')).toBe(String(SEEDED + 1))
    expect(text()).toContain(`Showing ${SEEDED + 1} of ${SEEDED + 1} seeded jobs`)
  })

  it('keeps the chip reconciliation guard silent while it does so', async () => {
    await mount()
    await announce(NEW_JOB)
    await announce(NEW_JOB)
    expect(text()).not.toContain('These counts do not reconcile')
  })
})
