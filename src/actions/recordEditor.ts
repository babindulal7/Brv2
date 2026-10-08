import { createAction, type ActionConfig } from './core'
import { supabase } from '../lib/supabase'
import type { RecordKind, RecordSnapshot, RecordValues } from '../lib/recordEditor'

export interface SaveRecordInput { kind:RecordKind; id:string|null; expectedRevision:string|null; clientUuid:string; values:RecordValues; rows:RecordValues[] }
export const saveRecordConfig:ActionConfig<SaveRecordInput,RecordSnapshot>={
  name:'SAVE_RECORD',permissions:[],implemented:true,
  validate(input) { if(!input.clientUuid || (input.id && !input.expectedRevision)) throw new Error('Reload the record before saving.'); },
  async execute(input,ctx) {
    const permitted=input.kind==='client'
      ? (input.id ? ['Owner','Admin','Manager','Coordinator'] : ['Owner','Admin','Manager','Coordinator','Warehouse'])
      : ['Owner','Admin','Manager']
    if(!permitted.includes(ctx.role)) throw new Error('You do not have permission to edit this record.')
    if(ctx.isOnline===false) throw new Error('Connect to save this record. Your changes are still here.')
    const {data,error}=await supabase.rpc('save_record_editor',{p_kind:input.kind,p_id:input.id,p_revision:input.expectedRevision,p_key:input.clientUuid,p_values:input.values,p_rows:input.rows})
    if(error) throw new Error(error.message)
    if(!data || typeof data!=='object' || !('revision' in data)) throw new Error('The save was not confirmed. Retry with your changes intact.')
    return {result:data as RecordSnapshot,events:[]}
  },
}
export const saveRecord=createAction(saveRecordConfig)
