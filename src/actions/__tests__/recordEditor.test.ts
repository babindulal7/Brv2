import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveRecordConfig, type SaveRecordInput } from '../recordEditor'
import type { SystemRole } from '../../types/database'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

const input: SaveRecordInput = {
  kind: 'client', id: null, expectedRevision: null, clientUuid: 'save-key',
  values: { name: 'Test client', phone: '+9779800000000' }, rows: [],
}
const ctx = (role: SystemRole) => ({ userId: 'operator-id', role, isOnline: true })

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: { id: 'client-id', code: 'CL-0010', revision: 'new-revision', values: input.values, rows: [] }, error: null })
})

describe('record editor action permissions', () => {
  it('allows Warehouse client intake through the atomic editor', async () => {
    const saved = await saveRecordConfig.execute(input, ctx('Warehouse'))
    expect(saved.result.id).toBe('client-id')
    expect(rpc).toHaveBeenCalledWith('save_record_editor', expect.objectContaining({ p_kind: 'client', p_id: null, p_key: 'save-key' }))
  })

  it('keeps Warehouse edits and equipment intake refused before dispatch', async () => {
    await expect(saveRecordConfig.execute({ ...input, id: 'client-id', expectedRevision: 'revision' }, ctx('Warehouse'))).rejects.toThrow('permission')
    await expect(saveRecordConfig.execute({ ...input, kind: 'equipment' }, ctx('Warehouse'))).rejects.toThrow('permission')
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['Driver', 'Technician', 'Client'] as SystemRole[])('refuses %s client intake', async (role) => {
    await expect(saveRecordConfig.execute(input, ctx(role))).rejects.toThrow('permission')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not report success after an unconfirmed write', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(saveRecordConfig.execute(input, ctx('Owner'))).rejects.toThrow('not confirmed')
  })
})
