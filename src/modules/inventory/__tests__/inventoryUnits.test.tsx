// @vitest-environment jsdom
/**
 * # The per-serial expansion fetches on EXPAND, and not before
 *
 * The mock carried every unit of every model in the array it filtered, so
 * `open` was free: `row.children.map(...)`. Against a database it is not. A
 * catalogue page is 25 models and a serialised model can hold 40 units, so
 * loading the expansion with the list would fetch a thousand rows to render the
 * one row somebody clicked — and `useList` cannot express "later", because it
 * fires on mount. That is why this is a hand-written hook rather than a second
 * `useList`, and why "not called while closed" is the assertion that matters.
 *
 * Law 6 is the second thing pinned here. `withMoney` reaches `listUnits` only
 * when the session may see money; a money-blind session must not name
 * `purchase_price` or `replacement_value` in the select at all.
 *
 * Environment pragma per `vitest.config.ts` — the suites are `node` by default
 * and this one needs a DOM to run the effect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const listUnitsSpy = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

// Only `listUnits` is replaced. The column constants and the named filter sets
// stay real, because `Inventory.tsx` evaluates them at module scope.
vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return {
    ...actual,
    listInventory: async () => ({ rows: [], total: 0 }),
    listUnits: (...args: Parameters<typeof actual.listUnits>) => listUnitsSpy(...args) as ReturnType<typeof actual.listUnits>,
  }
})

const { useUnitsOnDemand } = await import('../Inventory')
type UnitsOnDemand = ReturnType<typeof useUnitsOnDemand>

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root
const box = { current: undefined as unknown as UnitsOnDemand }

function Probe({ productId, open, money }: { productId: string; open: boolean; money: boolean }) {
  box.current = useUnitsOnDemand(productId, open, money)
  return null as unknown as ReactNode
}

async function show(props: { productId?: string; open: boolean; money?: boolean }) {
  await act(async () =>
    root.render(
      createElement(Probe, { productId: props.productId ?? 'p-1', open: props.open, money: props.money ?? false }),
    ),
  )
}

beforeEach(() => {
  listUnitsSpy.mockReset()
  listUnitsSpy.mockResolvedValue({ rows: [{ id: 'u-1' }], total: 1 })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('useUnitsOnDemand', () => {
  it('⛔ fetches NOTHING while the row is closed', async () => {
    await show({ open: false })
    expect(listUnitsSpy).not.toHaveBeenCalled()
    expect(box.current.rows).toBeNull()
    expect(box.current.loading).toBe(false)
  })

  it('fetches once, when the row is opened', async () => {
    await show({ open: false })
    await show({ open: true })
    expect(listUnitsSpy).toHaveBeenCalledTimes(1)
    expect(listUnitsSpy).toHaveBeenCalledWith('p-1', {})
    expect(box.current.rows).toHaveLength(1)
    expect(box.current.error).toBeNull()
  })

  it('does not re-fetch when the same row is collapsed and opened again', async () => {
    await show({ open: true })
    await show({ open: false })
    await show({ open: true })
    expect(listUnitsSpy).toHaveBeenCalledTimes(1)
  })

  it('Law 6 — passes `withMoney` only for a session that may see money', async () => {
    await show({ open: true, money: false })
    expect(listUnitsSpy).toHaveBeenLastCalledWith('p-1', {})

    // A change of gate is a different question, so it re-asks rather than
    // serving a money-blind result to a session that may see the figures.
    await show({ open: true, money: true })
    expect(listUnitsSpy).toHaveBeenLastCalledWith('p-1', { withMoney: true })
    expect(listUnitsSpy).toHaveBeenCalledTimes(2)
  })

  it('a different model is a different question', async () => {
    await show({ productId: 'p-1', open: true })
    await show({ productId: 'p-2', open: true })
    expect(listUnitsSpy).toHaveBeenCalledTimes(2)
    expect(listUnitsSpy).toHaveBeenLastCalledWith('p-2', {})
  })

  it('reports the bare reason on failure and keeps no rows — the row writes the sentence', async () => {
    listUnitsSpy.mockRejectedValueOnce(new Error('listUnits failed: JWT expired'))
    await show({ open: true })
    expect(box.current.error).toBe('listUnits failed: JWT expired')
    expect(box.current.rows).toBeNull()
    expect(box.current.loading).toBe(false)
  })

  it('retry asks again after a failure', async () => {
    listUnitsSpy.mockRejectedValueOnce(new Error('network down'))
    await show({ open: true })
    expect(box.current.error).toBe('network down')

    await act(async () => box.current.retry())
    expect(listUnitsSpy).toHaveBeenCalledTimes(2)
    expect(box.current.error).toBeNull()
    expect(box.current.rows).toHaveLength(1)
  })

  it('an empty result is a real answer, not a failure', async () => {
    listUnitsSpy.mockResolvedValue({ rows: [], total: 0 })
    await show({ open: true })
    expect(box.current.rows).toEqual([])
    expect(box.current.error).toBeNull()
  })
})
