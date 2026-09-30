import { beforeEach, describe, expect, it, vi } from 'vitest'

const { select, eq, maybeSingle, from } = vi.hoisted(() => ({
  select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(),
}))

vi.mock('../../supabase', () => ({
  supabase: { from },
  newClientUuid: () => '11111111-1111-4111-8111-111111111111',
}))

import { getClientPreviewRecord } from '../clients'

beforeEach(() => {
  vi.clearAllMocks()
  from.mockReturnValue({ select })
  select.mockReturnValue({ eq })
  eq.mockReturnValue({ maybeSingle })
  maybeSingle.mockResolvedValue({ data: {
    id: '11111111-1111-4111-8111-111111111111', client_code: 'C-1',
    name: 'Client One', membership_level: null, is_blocked: false, client_since: null,
  }, error: null })
})

describe('client preview database projection', () => {
  it('does not select PII or money columns for Warehouse', async () => {
    const record = await getClientPreviewRecord('C-1', { role: 'Warehouse' })
    const columns = select.mock.calls[0]?.[0] as string
    expect(columns).not.toMatch(/phone|email|outstanding|deposit/)
    expect(record).not.toHaveProperty('contact')
    expect(record).not.toHaveProperty('outstandingPaisa')
  })

  it('selects the classified fields for an authorized Owner', async () => {
    maybeSingle.mockResolvedValue({ data: {
      id: '11111111-1111-4111-8111-111111111111', client_code: 'C-1',
      name: 'Client One', membership_level: null, is_blocked: false, client_since: null,
      phone: '+9779800000000', email: 'client@example.com',
      outstanding_amount: 1200, deposit_held_amount: 500,
    }, error: null })
    const record = await getClientPreviewRecord('C-1', { role: 'Owner' })
    const columns = select.mock.calls[0]?.[0] as string
    expect(columns).toMatch(/phone, outstanding_amount|phone.*outstanding_amount/)
    expect(record?.contact?.email).toBe('client@example.com')
    expect(record?.outstandingPaisa).toBe(120000)
  })
})
