import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { newClientUuid, supabase } from '../../lib/supabase'

export type AdjustStockInput = {
  productId: string
  delta: number
  reason: string
  /** Reuse on retry so an interrupted response cannot apply twice. */
  clientUuid?: string
}

export type AdjustStockResult = {
  success: boolean
  productId: string
  quantityBefore: number
  quantityAfter: number
}

export const adjustStockConfig: ActionConfig<AdjustStockInput, AdjustStockResult> = {
  name: 'ADJUST_STOCK',
  permissions: ['inventory.stock_adjust'],
  implemented: true,
  validate: (input) => {
    if (!input.productId) throw new Error('Product is required.')
    if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
      throw new Error('Adjustment must be a non-zero whole number.')
    }
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error('Adjustment reason of at least ten characters is required.')
    }
  },
  execute: async (input, ctx: ActionContext) => {
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_product_id: input.productId,
      p_delta: input.delta,
      p_reason: input.reason.trim(),
      p_actor_id: ctx.userId,
      p_client_uuid: input.clientUuid ?? newClientUuid(),
    })
    if (error) throw error
    const row = data?.[0]
    if (!row || !Number.isInteger(row.quantity_before) || !Number.isInteger(row.quantity_after)) {
      throw new Error('Stock adjustment was not confirmed by the database. Refresh before retrying.')
    }
    return {
      result: {
        success: true,
        productId: input.productId,
        quantityBefore: row.quantity_before,
        quantityAfter: row.quantity_after,
      },
      events: [{
        type: EVENT_TYPES.STOCK_ADJUSTED,
        payload: { productId: input.productId, delta: input.delta, reason: input.reason.trim(), userId: ctx.userId },
      }],
    }
  },
}

export const adjustStock = createAction<AdjustStockInput, AdjustStockResult>(adjustStockConfig)
