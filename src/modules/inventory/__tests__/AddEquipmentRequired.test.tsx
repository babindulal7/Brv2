// @vitest-environment jsdom
/**
 * The required set on Add Equipment, driven through the form state rather than
 * through the seven-section screen.
 *
 * Ruling, 12 Aug 2026: **unit serial** and **warehouse + bin**. Name, category
 * and brand used to gate Create and no longer do.
 *
 * Those two earn it for a reason the other five do not: a unit without a serial
 * cannot be scanned at Packing, cannot be picked as a chip in New Rental, and
 * cannot be told from its siblings; a unit without a location cannot be found.
 * Everything else is information someone fills in later, and gating on it meant
 * a correction had to be a re-creation.
 *
 * `useEquipmentFormState` is the exported hook the provider wraps, so this
 * drives the real `validate` and the real `handleSubmit` without mounting the
 * form. Environment pragma per `vitest.config.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ToastProvider } from '../../../components/ui/Toast'

// The hook reads the session for money gating; Owner sees every section.
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

const { useEquipmentFormState } = await import('../components/AddEquipmentContext')
type EquipmentFormState = ReturnType<typeof useEquipmentFormState>

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root
const box = { current: undefined as unknown as EquipmentFormState }

function Probe() {
  box.current = useEquipmentFormState()
  return null as unknown as ReactNode
}

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(ToastProvider, null, createElement(Probe))))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

/** The two gates that stayed: a serial on every unit, and a warehouse + bin. */
async function satisfyTheFloorLoop() {
  await act(async () => {
    box.current.setUnits((prev) => prev.map((u) => ({ ...u, serial: 'SN-TEST-0001' })))
    box.current.setWarehouseId('wh-1')
    box.current.setLocationId('bin-1')
  })
}

async function create() {
  await act(async () => box.current.handleSubmit('create'))
}

describe('Add Equipment — Create no longer gates on name, category or brand', () => {
  it('creates with all three blank, given a serial and a location', async () => {
    await satisfyTheFloorLoop()
    await create()

    expect(box.current.errors.name).toBeUndefined()
    expect(box.current.errors.category).toBeUndefined()
    expect(box.current.errors.brand).toBeUndefined()
    expect(box.current.outcome?.kind).toBe('validated')
  })

  it('still refuses a unit with no serial — it could not be scanned at Packing', async () => {
    await act(async () => {
      box.current.setWarehouseId('wh-1')
      box.current.setLocationId('bin-1')
    })
    await create()

    expect(box.current.errors.stock).toContain('serial')
    expect(box.current.outcome).toBeNull()
  })

  it('still refuses a missing location — the floor has to be able to find it', async () => {
    await act(async () => {
      box.current.setUnits((prev) => prev.map((u) => ({ ...u, serial: 'SN-TEST-0002' })))
    })
    await create()

    expect(box.current.errors.location).toContain('required')
    expect(box.current.outcome).toBeNull()
  })

  it('relaxing required-ness did not relax the format rules that remain', async () => {
    /* §3 — quantity never appears in the name. That check was never a
       required-field gate and must survive the relaxation. */
    await satisfyTheFloorLoop()
    await act(async () => box.current.setName('NP-FZ100 Battery x4'))
    await create()

    expect(box.current.errors.name).toContain('Quantity never appears in the name')
    expect(box.current.outcome).toBeNull()
  })
})
