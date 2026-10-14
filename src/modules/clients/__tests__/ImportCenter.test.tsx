// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'
import type { ImportClientsInput } from '../../../actions/clients/importClients'

const mocks = vi.hoisted(() => ({ role: 'Owner' as SystemRole, online: true, matches: vi.fn(), save: vi.fn() }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'actor', role: mocks.role } }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => mocks.online }))
vi.mock('../../../lib/queries/clients', () => ({ findClientMatches: mocks.matches }))
vi.mock('../../../actions/clients/importClients', () => ({ importClients: mocks.save }))
vi.mock('../../../lib/supabase', () => ({ newClientUuid: () => crypto.randomUUID() }))
vi.mock('../../../components/ui/ScreenHeader', () => ({ ScreenHeader: ({ title, description }: { title: string; description: string }) => <header><h1>{title}</h1><p>{description}</p></header> }))
vi.mock('../../../components/ui/RecordWorkspace', () => ({ useUnsavedRecord: vi.fn(), UnsavedLeaveDialog: () => null }))

window.matchMedia = vi.fn().mockImplementation((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }))
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
const { default: ImportCenter } = await import('../ImportCenter')
let root: Root | undefined, container: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.role = 'Owner'; mocks.online = true
  mocks.matches.mockResolvedValue([])
  mocks.save.mockImplementation(async (input: ImportClientsInput) => {
    const outcomes = input.rows.map(row => ({ rowIndex: row.rowIndex, status: 'saved' as const, clientId: `id-${row.rowIndex}`, clientCode: `C-${row.rowIndex + 1}` }))
    input.onProgress?.(outcomes)
    return { outcomes }
  })
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
})
async function mount() {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(<MemoryRouter><ImportCenter /></MemoryRouter>))
}
async function upload(text: string) {
  const file = new File([text], 'clients.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => text })
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
}
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!

describe('client import interaction', () => {
  it('restores file, skipped rows and original receipt keys after a refresh', async () => {
    mocks.save.mockImplementationOnce(async (input: ImportClientsInput) => {
      const outcomes = [{ rowIndex: 0, status: 'saved' as const, clientId: 'first', clientCode: 'C-1' }, { rowIndex: 1, status: 'unconfirmed' as const, message: 'Confirmation lost. Retry.' }]
      input.onProgress?.(outcomes)
      return { outcomes }
    })
    await mount(); await upload('name,phone\nOne,9801234567\nTwo,9807654321\nSkip,9801111111')
    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Include row 3 (Skip)"]')!.click())
    await act(async () => button('Import 2 Clients').click())
    const original = mocks.save.mock.calls[0]![0] as ImportClientsInput
    await act(async () => root!.unmount()); root = undefined; container.remove()
    await mount()
    expect(container.textContent).toContain('Resume client import')
    expect(container.textContent).toContain('1 confirmed saved')
    await act(async () => button('Resume import').click())
    const skip = container.querySelector<HTMLInputElement>('input[aria-label="Include row 3 (Skip)"]')!
    expect(skip.checked).toBe(false)
    expect(skip.disabled).toBe(true)
    await act(async () => button('Check saved rows & continue').click())
    const retry = mocks.save.mock.calls[1]![0] as ImportClientsInput
    expect(retry.rows.map(row => row.clientUuid)).toEqual(original.rows.map(row => row.clientUuid))
    expect(container.textContent).toContain('2 of 2 clients confirmed saved.')
  })
  it('requires explicit confirmation to discard a draft and explains saved clients remain', async () => {
    await mount(); await upload('name,phone\nOne,9801234567')
    await act(async () => button('Choose Different File').click())
    expect(container.textContent).toContain('Clients already saved remain in the directory')
    expect(container.querySelector('[aria-label="CSV import preview"]')).not.toBeNull()
    await act(async () => button('Discard local draft').click())
    expect(container.querySelector('[aria-label="CSV import preview"]')).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('provides persistent labels for the responsive preview including status and selection', async () => {
    await mount(); await upload('name,phone\nOne,invalid')
    const preview = container.querySelector('.client-import-preview')!
    expect([...preview.querySelectorAll('td')].map(cell => cell.getAttribute('data-label'))).toEqual(['Include row', 'Row', 'Name', 'Phone', 'Type', 'Status'])
    expect(preview.querySelector('td[data-label="Status"]')!.textContent).toContain('Nepali mobile')
  })
  it('saves a reviewed file once despite a double click and shows confirmed client links', async () => {
    await mount(); await upload('name,phone\nOne,9801234567\nTwo,9807654321')
    const save = button('Import 2 Clients')
    expect(save.disabled).toBe(false)
    await act(async () => { save.click(); save.click() })
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('2 of 2 clients confirmed saved.')
    expect(container.querySelector('a[href="/clients/id-0"]')).not.toBeNull()
    expect(button('Import complete').disabled).toBe(true)
  })
  it('keeps failed rows and retries with the original keys without re-saving confirmed rows', async () => {
    mocks.save.mockImplementationOnce(async (input: ImportClientsInput) => {
      const outcomes = [{ rowIndex: 0, status: 'saved' as const, clientId: 'first', clientCode: 'C-1' }, { rowIndex: 1, status: 'unconfirmed' as const, message: 'Confirmation lost. Retry.' }]
      input.onProgress?.(outcomes)
      return { outcomes }
    })
    await mount(); await upload('name,phone\nOne,9801234567\nTwo,9807654321')
    await act(async () => button('Import 2 Clients').click())
    const original = mocks.save.mock.calls[0]![0] as ImportClientsInput
    expect(container.textContent).toContain('1 of 2 clients confirmed saved.')
    expect(container.textContent).toContain('Confirmation lost. Retry.')
    await act(async () => button('Retry remaining rows').click())
    const retry = mocks.save.mock.calls[1]![0] as ImportClientsInput
    expect(retry.rows).toHaveLength(1)
    expect(retry.rows[0]!.clientUuid).toBe(original.rows[1]!.clientUuid)
    expect(container.textContent).toContain('2 of 2 clients confirmed saved.')
  })
  it('blocks duplicate rows until one is explicitly deselected', async () => {
    await mount(); await upload('name,phone\nOne,9801234567\nTwo,9801234567')
    expect(container.textContent).toContain('Repeated phone')
    expect(mocks.save).not.toHaveBeenCalled()
    const include = container.querySelector<HTMLInputElement>('input[aria-label="Include row 2 (Two)"]')!
    await act(async () => include.click())
    expect(button('Import 1 Client').disabled).toBe(false)
    await act(async () => button('Import 1 Client').click())
    expect((mocks.save.mock.calls[0]![0] as ImportClientsInput).rows).toHaveLength(1)
  })
  it('shows read failures and retries the duplicate check before permitting a save', async () => {
    mocks.matches.mockRejectedValueOnce(new Error('Directory offline'))
    await mount(); await upload('name,phone\nOne,9801234567')
    expect(button('Import 1 Client').disabled).toBe(true)
    expect(container.textContent).toContain('Directory offline')
    await act(async () => button('Retry duplicate check').click())
    expect(button('Import 1 Client').disabled).toBe(false)
  })
  it('retains empty columns and blocks colliding automatic mappings', async () => {
    await mount(); await upload('name,name,phone,empty\nOne,Two,9801234567,')
    expect(container.textContent).toContain('4 columns retained')
    expect(container.textContent).toContain('Columns 1, 2 map')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects an unreadable file without displaying a previous successful parse', async () => {
    await mount(); await upload('name,phone\n"unterminated,9801234567')
    expect(container.textContent).toContain('never closed')
    expect(container.querySelector('[aria-label="CSV import preview"]')).toBeNull()
  })
  it.each(['Warehouse', 'Accounts', 'Technician', 'Driver', 'Client'] as SystemRole[])('refuses %s before duplicate contact reads', async role => {
    mocks.role = role; await mount()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(mocks.matches).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
