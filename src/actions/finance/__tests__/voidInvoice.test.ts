import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
  result: { data: null as unknown, error: null as unknown },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpc.calls.push({ name, args })
      return rpc.result
    },
  },
}))

import { voidInvoice } from '../voidInvoice'

describe('voidInvoice Action', () => {
  beforeEach(() => {
    rpc.calls = []
    rpc.result = {
      data: {
        invoice_id: 'inv-123',
        status: 'Void',
        credit_note_no: 'CN-001',
        voided_at: '2026-09-11T05:00:00Z',
      },
      error: null,
    }
  })

  it('rejects an empty invoiceId', async () => {
    await expect(
      voidInvoice({ invoiceId: '', reason: 'Client requested cancellation' }, { userId: 'u1', role: 'Accounts' }),
    ).rejects.toThrow(/invoice ID is required/)
  })

  it('rejects a reason shorter than 10 characters', async () => {
    await expect(
      voidInvoice({ invoiceId: 'inv-123', reason: 'mistake' }, { userId: 'u1', role: 'Accounts' }),
    ).rejects.toThrow(/at least 10 characters/)
  })

  it('rejects execution when offline via capability check', async () => {
    await expect(
      voidInvoice(
        { invoiceId: 'inv-123', reason: 'Cancelled by client agreement' },
        { userId: 'u1', role: 'Accounts', isOnline: false },
      ),
    ).rejects.toThrow(/requires invoice.void/)
  })

  it('dispatches void_invoice RPC with client_uuid and created_by', async () => {
    const outcome = await voidInvoice(
      {
        invoiceId: 'inv-123',
        reason: 'Cancelled by client agreement',
        clientUuid: 'uuid-key-1',
      },
      { userId: 'user-accounts', role: 'Accounts' },
    )

    expect(rpc.calls).toHaveLength(1)
    expect(rpc.calls[0]?.name).toBe('void_invoice')
    expect(rpc.calls[0]?.args).toEqual({
      p_payload: {
        invoice_id: 'inv-123',
        reason: 'Cancelled by client agreement',
        client_uuid: 'uuid-key-1',
        created_by: 'user-accounts',
      },
    })

    expect(outcome.status).toBe('Void')
    expect(outcome.creditNoteNo).toBe('CN-001')
    expect(outcome.invoiceId).toBe('inv-123')
  })

  it('formats database gate errors cleanly when RPC raises', async () => {
    rpc.result = {
      data: null,
      error: {
        message: 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.',
      },
    }

    await expect(
      voidInvoice(
        { invoiceId: 'inv-123', reason: 'Cancelled by client agreement' },
        { userId: 'user-coord', role: 'Accounts' },
      ),
    ).rejects.toThrow(/Void Authorization Denied/)
  })

  it('is refused for roles lacking invoice.void capability', async () => {
    await expect(
      voidInvoice(
        { invoiceId: 'inv-123', reason: 'Cancelled by client agreement' },
        { userId: 'wh-1', role: 'Warehouse' },
      ),
    ).rejects.toThrow(/requires invoice.void/)
  })
})
