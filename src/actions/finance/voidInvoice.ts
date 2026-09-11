import { createAction, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { formatGateError } from '../../lib/gates'

export interface VoidInvoiceInput {
  invoiceId: string
  reason: string
  clientUuid?: string
}

export interface VoidInvoiceResult {
  invoiceId: string
  status: 'Void'
  creditNoteNo?: string | null
  voidedAt: string
}

export const voidInvoice = createAction<VoidInvoiceInput, VoidInvoiceResult>({
  name: 'VOID_INVOICE',
  permissions: ['invoice.void'],
  implemented: true,

  validate: (input: VoidInvoiceInput) => {
    if (!input.invoiceId || input.invoiceId.trim() === '') {
      throw new Error('An invoice ID is required to void an invoice.')
    }
    const reason = (input.reason || '').trim()
    if (reason.length < 10) {
      throw new Error('A cancellation reason of at least 10 characters is mandatory.')
    }
  },

  execute: async (input: VoidInvoiceInput, ctx: ActionContext) => {
    if (ctx.isOnline === false) {
      throw new Error('Voiding an invoice requires an online connection to the database. Nothing was voided.')
    }

    const { data, error } = await supabase.rpc('void_invoice', {
      p_payload: {
        invoice_id: input.invoiceId,
        reason: input.reason.trim(),
        client_uuid: input.clientUuid || null,
        created_by: ctx.userId,
      },
    })

    if (error) {
      throw new Error(formatGateError(error))
    }

    const res = data as {
      invoice_id: string
      status: 'Void'
      credit_note_no?: string | null
      voided_at: string
    }

    const result: VoidInvoiceResult = {
      invoiceId: res.invoice_id || input.invoiceId,
      status: 'Void',
      creditNoteNo: res.credit_note_no ?? null,
      voidedAt: res.voided_at || new Date().toISOString(),
    }

    return {
      result,
      events: [
        {
          type: EVENT_TYPES.INVOICE_VOIDED,
          payload: result,
        },
      ],
    }
  },
})
