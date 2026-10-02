import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import type { QuoteSnapshot } from '../../lib/queries/quoteEditor'
import { quoteUpdatePayload } from '../../lib/queries/quoteEditor'
import type { RentalDraftData } from './saveDraft'
import type { Paisa } from '../../lib/money'

export interface UpdateRentalQuoteInput { bookingId:string; expectedRevision:string; clientUuid:string; draft:RentalDraftData; snapshot:QuoteSnapshot; depositPaisa:Paisa }
export const updateRentalQuoteConfig:ActionConfig<UpdateRentalQuoteInput,QuoteSnapshot>={name:'UPDATE_RENTAL_QUOTE',permissions:[],implemented:true,
  validate(input){if(!input.bookingId || !input.expectedRevision || !input.clientUuid || input.snapshot.id!==input.bookingId)throw new Error('Reload the booking before editing.')},
  async execute(input,ctx){
    if(!['Owner','Admin','Manager','Coordinator'].includes(ctx.role))throw new Error('You cannot edit this booking.')
    if(ctx.isOnline===false)throw new Error('Connect to save this quote. Your changes are still here.')
    const {data,error}=await supabase.rpc('update_rental_quote',{p_id:input.bookingId,p_revision:input.expectedRevision,p_key:input.clientUuid,p_payload:quoteUpdatePayload(input.draft,input.snapshot,input.depositPaisa)})
    if(error)throw new Error(error.message)
    if(!data || typeof data!=='object' || !('revision' in data))throw new Error('The save was not confirmed. Retry without leaving this page.')
    return {result:data as QuoteSnapshot,events:[]}
  },
}
export const updateRentalQuote=createAction(updateRentalQuoteConfig)
