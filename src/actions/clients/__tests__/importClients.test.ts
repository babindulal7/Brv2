import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importClients, importClientsConfig, type ImportClientsInput } from '../importClients'
import type { SystemRole } from '../../../types/database'

const mocks = vi.hoisted(() => ({ save: vi.fn(), matches: vi.fn(), previous: vi.fn() }))
vi.mock('../../recordEditor', () => ({ saveRecord: mocks.save }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ in: mocks.previous }) }) } }))
vi.mock('../../../lib/queries/clients', () => ({ findClientMatches: mocks.matches }))
vi.mock('../../../events/eventBus', () => ({ EVENT_TYPES: { CLIENT_CREATED: 'client.created' }, DomainEvents: { emit: vi.fn() } }))

const ctx = (role: SystemRole = 'Owner') => ({ userId: 'actor', role, isOnline: true })
const input = (): ImportClientsInput => ({ rows: [0, 1, 2].map(index => ({
  rowIndex: index, clientUuid: `00000000-0000-4000-8000-00000000000${index}`,
  values: { name: `Client ${index}`, phone: `+977980123456${index}`, type_parent: 'Individual', org_subtype: null },
})) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.previous.mockResolvedValue({ data: [], error: null })
  mocks.matches.mockResolvedValue([])
  mocks.save.mockImplementation(async (row: { clientUuid: string }) => ({ id: row.clientUuid, code: 'C-1', revision: 'r', values: {}, rows: [] }))
})
afterEach(() => vi.useRealTimers())

describe('client import write outcomes', () => {
  it('writes supported fields through the transactional save and counts confirmed rows', async () => {
    const request = input()
    const progress = vi.fn()
    const result = await importClients({ ...request, onProgress: progress }, ctx())
    expect(result.outcomes.map(row => row.status)).toEqual(['saved', 'saved', 'saved'])
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'client', id: null, clientUuid: request.rows[0]!.clientUuid, values: request.rows[0]!.values, rows: [] }), ctx())
    expect(progress).toHaveBeenCalledTimes(3)
  })
  it('stops on failure and leaves later rows pending', async () => {
    mocks.save.mockImplementationOnce(async () => ({ id: 'first', code: 'C-1', revision: 'r' })).mockRejectedValueOnce(new Error('Database refused row'))
    const result = await importClients(input(), ctx())
    expect(result.outcomes.map(row => row.status)).toEqual(['saved', 'failed', 'pending'])
    expect(result.outcomes[1]!.message).toBe('Database refused row')
    expect(mocks.save).toHaveBeenCalledTimes(2)
  })
  it('retries a committed-but-unconfirmed row with the same receipt key', async () => {
    const request = { rows: [input().rows[0]!] }
    mocks.save.mockRejectedValueOnce(new Error('Connection lost after commit'))
    const first = await importClients(request, ctx())
    expect(first.outcomes[0]!.status).toBe('failed')
    mocks.previous.mockResolvedValue({ data: [{ id: 'saved-id', client_uuid: request.rows[0]!.clientUuid }], error: null })
    mocks.matches.mockResolvedValue([{ id: 'C-1', dbId: 'saved-id' }])
    const retried = await importClients(request, ctx())
    expect(retried.outcomes[0]!.status).toBe('saved')
    expect(mocks.save.mock.calls[0]![0].clientUuid).toBe(mocks.save.mock.calls[1]![0].clientUuid)
  })
  it('marks a timed-out save as unconfirmed, with later rows untouched', async () => {
    vi.useFakeTimers()
    mocks.save.mockImplementationOnce(() => new Promise(() => {}))
    const work = importClientsConfig.execute(input(), ctx())
    await vi.advanceTimersByTimeAsync(20_001)
    const { result } = await work
    expect(result.outcomes.map(row => row.status)).toEqual(['unconfirmed', 'pending', 'pending'])
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
  it('refuses an existing match before any writes', async () => {
    mocks.matches.mockResolvedValue([{ id: 'C-88', dbId: 'other-id' }])
    await expect(importClients(input(), ctx())).rejects.toThrow('existing client')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('refuses saving if the duplicate check fails', async () => {
    mocks.matches.mockRejectedValue(new Error('Directory unavailable'))
    await expect(importClients(input(), ctx())).rejects.toThrow('Directory unavailable')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('stops after the current row when requested', async () => {
    let stop = false
    const result = await importClients({ ...input(), shouldStop: () => stop, onProgress: () => { stop = true } }, ctx())
    expect(result.outcomes.map(row => row.status)).toEqual(['saved', 'pending', 'pending'])
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
  it.each(['Warehouse', 'Accounts', 'Technician', 'Driver', 'Client'] as SystemRole[])('refuses %s before reading or saving contacts', async role => {
    await expect(importClients(input(), ctx(role))).rejects.toThrow()
    expect(mocks.previous).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('refuses offline work instead of queueing it', async () => {
    await expect(importClients(input(), { ...ctx(), isOnline: false })).rejects.toThrow('Connect')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('validates every row before the first write', async () => {
    const request = input()
    request.rows[2]!.values.pan_vat = '12'
    await expect(importClients(request, ctx())).rejects.toThrow('Row 3')
    expect(mocks.previous).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('refuses duplicate keys and duplicate phones', () => {
    const request = input()
    const first = request.rows[0]!, second = request.rows[1]!
    expect(() => importClientsConfig.validate({ rows: [first, { ...second, clientUuid: first.clientUuid }] })).toThrow('save key')
    expect(() => importClientsConfig.validate({ rows: [first, { ...second, values: first.values }] })).toThrow('Repeated')
  })
})
