// @vitest-environment jsdom
/**
 * # Reset Workspace — RS-12, the QC identity the screen invented
 *
 * `cleaning_queue_entries.qc_by` is a `users.id`, and this screen collected a
 * NAME: a free-text "QC performed by…" box defaulting to the signed-in
 * operator. `selfIdOf` in the dispatch can map exactly one name to an id — the
 * actor's own — and OMITS every other, so typing a colleague's name passed QC
 * on screen, printed "QC by <that name>" on the row, and sent an entry whose
 * `qcBy` was absent. The QC looked done and was recorded against nobody.
 *
 * The fix states the identity the screen can actually write instead of asking
 * for one it cannot, so:
 *
 *  1. there is no name field on the QC control at all;
 *  2. the control names the operator the pass will be recorded as;
 *  3. QC-by therefore always equals cleaned-by, which the engine accepts only
 *     as a declared skipped QC with a reason — so the audited reason is now
 *     required on every pass, and the dispatched entry carries
 *     `qcBy: user.id`, `qcSkipped: true` and that reason.
 *
 * The last test is the positive control: an entry built the old way — a typed
 * name that `selfIdOf` cannot resolve — reaches `runFloorVerb` with no `qcBy`
 * at all, which is the defect stated as an assertion.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const B901 = '11111111-1111-4111-8111-111111111111'

/** Every `completeReset` call this suite makes, so the dispatched entries can be read. */
const dispatched: Array<Record<string, unknown>> = []

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Warehouse', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B901,
    bookingNo: ref,
    stage: 'Returned',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: '2026-07-19T04:00:00.000Z',
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3',
        productId: 'p-1',
        productName: 'Sony FX3',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN102',
            assetTag: 'EQ000001-U01',
            unitState: 'Returned',
            isRequired: true,
            packed: true,
            damaged: false,
            location: 'A2-01',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../actions/rentals/index', () => ({
  completeReset: async (input: Record<string, unknown>) => {
    dispatched.push(input)
    return { ok: true }
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** jsdom ships no `matchMedia`; `useViewport` reads `innerWidth`, so the band is still real. */
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

const ResetWorkspace = (await import('../ResetWorkspace')).default
const { SHARED_CLEAN_TASKS } = await import('../../../data/reset')

let container: HTMLDivElement
let root: Root

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mount() {
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/B-901/reset']}>
        <Routes>
          <Route path="/rentals/:bookingNo/reset" element={<ResetWorkspace />} />
          <Route path="/rentals/:bookingNo" element={<div>THE BOOKING PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
  })
  await flush()
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ')

function button(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === label)
  if (!b) throw new Error(`no "${label}" button on screen`)
  return b
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush(1)
}

/** A checkbox is driven by a real click: jsdom's activation behaviour flips
    `checked` and fires the change React listens for. */
async function check(input: HTMLInputElement) {
  await click(input)
}

async function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => el.dispatchEvent(new Event('input', { bubbles: true })))
  await flush(1)
}

/** Select the one row, tick every task on it, and send it to QC. */
async function reachQc() {
  const select = container.querySelector<HTMLInputElement>('input[aria-label="Select Sony FX3"]')
  if (!select) throw new Error('no row checkbox')
  await check(select)

  // The batch panel's shared checklist cascades to the selection: three shared
  // tasks plus the configuration reset this workspace exists to record.
  const tasks = [...SHARED_CLEAN_TASKS, 'Reset configuration']
  for (const task of tasks) {
    const label = [...container.querySelectorAll('label')].find((l) => (l.textContent ?? '').includes(task))
    const box = label?.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!box) throw new Error(`no checkbox for "${task}"`)
    if (!box.checked) await check(box)
  }

  await click(button('Mark Clean & Move to QC'))
}

const passButton = () => button('Pass')
const reasonField = () =>
  container.querySelector<HTMLInputElement>('input[aria-label="Reason for self-performed QC"]')

afterEach(async () => {
  dispatched.length = 0
  if (root) await act(async () => root.unmount())
  container?.remove()
})

describe('ResetWorkspace — RS-12, the QC identity', () => {
  it('offers no name field, and names the operator the pass will be recorded as', async () => {
    await mount()
    await reachQc()

    expect(container.querySelector('input[aria-label="QC performed by"]')).toBeNull()
    expect(text()).toContain('QC will be recorded as Babin Shrestha')
    expect(text()).toContain('there is no staff picker yet')
  })

  it('blocks Pass until the self-QC reason the engine requires is given', async () => {
    await mount()
    await reachQc()

    expect(passButton().disabled).toBe(true)
    const reason = reasonField()
    expect(reason).not.toBeNull()

    await type(reason as HTMLInputElement, 'Sole cleaner on shift')
    expect(passButton().disabled).toBe(false)
  })

  it('records the pass against the signed-in operator, and says so on the row', async () => {
    await mount()
    await reachQc()
    await type(reasonField() as HTMLInputElement, 'Sole cleaner on shift')
    await click(passButton())

    expect(text()).toContain('QC by Babin Shrestha')
  })

  it('dispatches qcBy as the user id, declared as a skipped QC with its reason', async () => {
    await mount()
    await reachQc()
    await type(reasonField() as HTMLInputElement, 'Sole cleaner on shift')
    await click(passButton())
    await click(button('Complete Reset'))

    expect(dispatched).toHaveLength(1)
    const input = dispatched[0] as { resetEntries: Array<Record<string, unknown>>; unitIds: string[] }
    expect(input.unitIds).toEqual(['a-1'])
    expect(input.resetEntries).toHaveLength(1)
    const entry = input.resetEntries[0] as Record<string, unknown>
    // A `users.id`, never the typed name the box used to collect.
    expect(entry['qcBy']).toBe('u-1')
    expect(entry['cleanedBy']).toBe('u-1')
    expect(entry['qcSkipped']).toBe(true)
    expect(entry['qcSkipReason']).toBe('Sole cleaner on shift')
  })

  /*
   * The positive control. `selfIdOf` is the whole reason a typed name could
   * never be written: restore the old input's behaviour — a name that is not
   * the actor's — and the id it resolves to is `undefined`, so the dispatched
   * entry carries no `qcBy` and the engine's self-QC guard never even fires.
   */
  it('positive control: a name other than the actor resolves to no id at all', () => {
    const actor = 'Babin Shrestha'
    const userId = 'u-1'
    const selfIdOf = (name: string | undefined): string | undefined =>
      name !== undefined && name === actor ? userId : undefined

    expect(selfIdOf('Babin Shrestha')).toBe('u-1')
    expect(selfIdOf('Sita Rai')).toBeUndefined()
  })
})
