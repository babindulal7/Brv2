import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ range: vi.fn(), from: vi.fn() }))
vi.mock('../../supabase', () => ({ IS_MOCK: false, supabase: { from: mock.from } }))
import { loadIntelNotes } from '../intelExtras'

beforeEach(() => {
  vi.resetAllMocks()
  const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: mock.range }
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain); chain.order.mockReturnValue(chain)
  mock.from.mockReturnValue(chain)
})

describe('visible Intel note history', () => {
  it('reads every page while narrowing management and operations visibility', async () => {
    const notes = Array.from({ length: 101 }, (_, index) => ({ id: String(index), body: `Note ${index}`, created_at: '2026-10-13T00:00:00Z',
      visibility: index === 0 ? 'management' : index === 1 ? 'operations' : 'all_staff' }))
    mock.range.mockResolvedValueOnce({ data: notes.slice(0, 100), error: null }).mockResolvedValueOnce({ data: notes.slice(100), error: null })
    const result = await loadIntelNotes('client', 'c1', { role: 'Accounts' })
    expect(result).toHaveLength(99)
    expect(result.some(note => note.body === 'Note 0' || note.body === 'Note 1')).toBe(false)
    expect(result.at(-1)?.body).toBe('Note 100')
    expect(mock.range).toHaveBeenLastCalledWith(100, 199)
  })
  it('reports a later page failure rather than returning partial history', async () => {
    mock.range.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ id: String(index), body: 'Note', visibility: 'all_staff', created_at: '' })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    await expect(loadIntelNotes('rental', 'r1', { role: 'Owner' })).rejects.toThrow('offline')
  })
})
