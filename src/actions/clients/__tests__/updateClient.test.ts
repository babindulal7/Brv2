import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateClientConfig, type UpdateClientInput } from '../updateClient'
import { EVENT_TYPES } from '../../../events/eventBus'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; id: string; payload: Record<string, unknown>; clientUuid?: string }>,
  insertResult: { data: { id: 'contact-uuid-1' }, error: null as unknown },
  updateResult: { data: { id: 'client-uuid-1', client_code: 'CL-2026-0001', name: 'Test Client' }, error: null as unknown },
  updateThrows: null as string | null,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    return access.insertResult
  },
  safeUpdate: async (
    table: string,
    id: string,
    payload: Record<string, unknown>,
    clientUuid?: string,
    _opts?: Record<string, unknown>
  ) => {
    access.updates.push({ table, id, payload, ...(clientUuid === undefined ? {} : { clientUuid }) })
    if (access.updateThrows) throw new Error(access.updateThrows)
    return access.updateResult
  },
}))

const db = vi.hoisted(() => {
  const state = {
    contactRow: null as { id: string } | null,
  }

  const builder: Record<string, unknown> = {}
  builder['select'] = () => builder
  builder['eq'] = () => builder
  builder['maybeSingle'] = async () => ({ data: state.contactRow, error: null })

  return {
    state,
    supabase: {
      from: () => builder,
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}))

const profile = vi.hoisted(() => ({
  record: {
    id: 'client-uuid-1',
    record: { id: 'CL-2026-0001', name: 'Existing Client' },
  } as unknown,
}))

vi.mock('../../../lib/queries/clients', () => ({
  getClientRecord: async (ref: string) => {
    if (ref === 'CL-2026-0001' || ref === 'client-uuid-1' || ref === 'C-100') {
      return profile.record
    }
    return null
  },
}))

describe('UPDATE_CLIENT action', () => {
  beforeEach(() => {
    access.inserts = []
    access.updates = []
    access.updateThrows = null
    access.updateResult = {
      data: { id: 'client-uuid-1', client_code: 'CL-2026-0001', name: 'Test Client' },
      error: null,
    }
    db.state.contactRow = null
  })

  it('declares implemented: true and requires client.update permission', () => {
    expect(updateClientConfig.implemented).toBe(true)
    expect(updateClientConfig.permissions).toEqual(['client.update'])
  })

  it('validates input: requires clientId', () => {
    expect(() =>
      updateClientConfig.validate({ clientId: '', patch: { name: 'Alice' } })
    ).toThrow(/Client ID is required/)
  })

  it('validates input: requires non-empty patch', () => {
    expect(() =>
      updateClientConfig.validate({ clientId: 'client-uuid-1', patch: {} })
    ).toThrow(/the patch is empty/)
  })

  it('rejects attempts to overwrite immutable identity columns', () => {
    expect(() =>
      updateClientConfig.validate({
        clientId: 'client-uuid-1',
        patch: { client_code: 'CL-9999-9999' },
      })
    ).toThrow(/Field 'client_code' cannot be modified/)

    expect(() =>
      updateClientConfig.validate({
        clientId: 'client-uuid-1',
        patch: { status: 'Deactivated' },
      })
    ).toThrow(/Field 'status' cannot be modified/)
  })

  it('validates phone format: rejects malformed numbers', () => {
    expect(() =>
      updateClientConfig.validate({
        clientId: 'client-uuid-1',
        patch: { phone: '12345' },
      })
    ).toThrow(/Must be a 10-digit Nepali mobile/)
  })

  it('validates PAN format: rejects non-9-digit PAN', () => {
    expect(() =>
      updateClientConfig.validate({
        clientId: 'client-uuid-1',
        patch: { pan: '12345' },
      })
    ).toThrow(/PAN\/VAT must be exactly 9 digits/)
  })

  it('executes client update with UUID and writes through safeUpdate', async () => {
    const input: UpdateClientInput = {
      clientId: '11111111-1111-4111-8111-111111111111',
      patch: {
        name: 'Kathmandu Film Collective',
        phone: '9801234567',
        city: 'Patan',
      },
      clientUuid: 'action-uuid-1',
    }

    const res = await updateClientConfig.execute(input, {
      userId: 'user-actor-1',
      role: 'Manager',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.clientId).toBe('11111111-1111-4111-8111-111111111111')
    expect(res.result.changedKeys).toEqual(['name', 'phone', 'city'])

    expect(access.updates).toHaveLength(1)
    const update = access.updates[0]!
    expect(update.table).toBe('clients')
    expect(update.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(update.payload).toEqual({
      name: 'Kathmandu Film Collective',
      phone: '+9779801234567',
      city: 'Patan',
    })
    expect(update.clientUuid).toBe('action-uuid-1')

    expect(res.events).toHaveLength(1)
    const ev = res.events[0]!
    expect(ev.type).toBe(EVENT_TYPES.CLIENT_UPDATED)
    const evPayload = ev.payload as { clientId: string; changedKeys: string[] }
    expect(evPayload.clientId).toBe('11111111-1111-4111-8111-111111111111')
    expect(evPayload.changedKeys).toEqual(['name', 'phone', 'city'])
  })

  it('resolves client code to UUID when code is passed', async () => {
    const input: UpdateClientInput = {
      clientId: 'CL-2026-0001',
      patch: { notes: 'VIP Client' },
    }

    const res = await updateClientConfig.execute(input, {
      userId: 'user-actor-1',
      role: 'Manager',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.clientId).toBe('client-uuid-1')
    expect(res.result.clientCode).toBe('CL-2026-0001')
    expect(access.updates[0]!.id).toBe('client-uuid-1')
    expect(access.updates[0]!.payload).toEqual({ notes: 'VIP Client' })
  })

  it('updates existing contact when contact fields are in patch', async () => {
    db.state.contactRow = { id: 'contact-row-42' }

    const input: UpdateClientInput = {
      clientId: 'client-uuid-1',
      patch: {
        contact_name: 'Babin Maharjan',
        contact_phone: '9841234567',
      },
    }

    await updateClientConfig.execute(input, {
      userId: 'user-actor-1',
      role: 'Manager',
    })

    const contactUpdate = access.updates.find((u) => u.table === 'client_contacts')
    expect(contactUpdate).toBeDefined()
    expect(contactUpdate?.id).toBe('contact-row-42')
    expect(contactUpdate?.payload).toEqual({
      full_name: 'Babin Maharjan',
      phone: '9841234567',
    })
  })

  it('inserts contact when no primary contact exists and contact_name is supplied', async () => {
    db.state.contactRow = null

    const input: UpdateClientInput = {
      clientId: 'client-uuid-1',
      patch: {
        contact_name: 'New Contact Person',
        contact_designation: 'Producer',
      },
    }

    await updateClientConfig.execute(input, {
      userId: 'user-actor-1',
      role: 'Manager',
    })

    expect(access.inserts).toHaveLength(1)
    expect(access.inserts[0]!.table).toBe('client_contacts')
    expect(access.inserts[0]!.payload).toMatchObject({
      client_id: 'client-uuid-1',
      full_name: 'New Contact Person',
      designation: 'Producer',
      is_primary: true,
    })
  })
})
