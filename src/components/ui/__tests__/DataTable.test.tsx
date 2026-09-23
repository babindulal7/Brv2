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
const originalWidth = window.innerWidth

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
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
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

  it('renders phone records with selection and opening actions, without a desktop table', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true })
    let opened = ''
    mount(<DataTable ariaLabel="Rentals" columns={columns} rows={rows} getRowId={(row) => row.id} onRowOpen={(row) => { opened = row.id }} />)
    expect(container?.querySelector('table')).toBeNull()
    expect(container?.querySelector('article')?.textContent).toContain('Himalayan Films')
    act(() => (container?.querySelector('button') as HTMLButtonElement).click())
    expect(opened).toBe('BR-1')
  })

  it('reports sorting and does not open rows from nested links', () => {
    let direction = ''
    const sortable = [{ id: 'client', header: 'Client', sortable: true, cell: (row: Row) => <a href="#client">{row.name}</a> }]
    mount(<DataTable ariaLabel="Rentals" columns={sortable} rows={rows} getRowId={(row) => row.id} sort={{ columnId: 'client', direction: 'asc' }} onSortChange={(next) => { direction = next.direction }} onRowOpen={() => { throw new Error('nested link must not open row') }} />)
    expect(container?.querySelector('th')?.getAttribute('aria-sort')).toBe('ascending')
    act(() => (container?.querySelector('th button') as HTMLButtonElement).click())
    expect(direction).toBe('desc')
    act(() => container?.querySelector('a')?.click())
  })

  it('does not display stale rows when loading fails', () => {
    mount(<DataTable ariaLabel="Rentals" columns={columns} rows={rows} getRowId={(row) => row.id} error="Could not load rentals. Retry." />)
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('Could not load rentals')
    expect(container?.querySelector('table')).toBeNull()
  })
})
