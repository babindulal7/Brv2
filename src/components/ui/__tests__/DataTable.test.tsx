// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DataTable } from '../DataTable'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Row = { id: string; name: string; amount: string }
const rows: Row[] = [{ id: 'BR-1', name: 'Himalayan Films', amount: 'Rs 82,000' }]
const columns = [
  { id: 'rental', header: 'Rental', cell: (row: Row) => row.id },
  { id: 'client', header: 'Client', cell: (row: Row) => row.name },
  { id: 'amount', header: 'Amount', cell: (row: Row) => row.amount, align: 'right' as const },
]

let root: Root | undefined
let container: HTMLDivElement | undefined

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('DataTable', () => {
  it('uses semantic headers and opens a row from the keyboard', () => {
    let opened = ''
    mount(<DataTable ariaLabel="Rentals" columns={columns} rows={rows} getRowId={(row) => row.id} onRowOpen={(row) => { opened = row.id }} />)

    expect(container?.querySelector('th[scope="col"]')?.textContent).toBe('Rental')
    const row = container?.querySelector('tbody tr') as HTMLTableRowElement
    act(() => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(opened).toBe('BR-1')
  })

  it('reports selection changes without opening the row', () => {
    let selected = new Set<string>()
    mount(<DataTable ariaLabel="Rentals" columns={columns} rows={rows} getRowId={(row) => row.id} onSelectedIdsChange={(next) => { selected = next }} onRowOpen={() => { throw new Error('row should not open') }} />)

    const checkbox = container?.querySelector('tbody input[type="checkbox"]') as HTMLInputElement
    act(() => checkbox.click())
    expect([...selected]).toEqual(['BR-1'])
  })

  it('has a visible empty state', () => {
    mount(<DataTable ariaLabel="Rentals" columns={columns} rows={[]} getRowId={(row) => row.id} emptyState="No rentals found" />)
    expect(container?.textContent).toContain('No rentals found')
  })
})
