import { supabase } from '../supabase'
import type { RecordKind, RecordSnapshot } from '../recordEditor'

export async function readRecordEditor(kind:RecordKind, id:string):Promise<RecordSnapshot> {
  const {data,error}=await supabase.rpc('read_record_editor',{p_kind:kind,p_id:id})
  if(error) throw new Error(error.message)
  if(!data || typeof data !== 'object' || !('revision' in data)) throw new Error('The record could not be loaded. No changes were made.')
  return data as RecordSnapshot
}
export async function recordEditorOptions(source:'categories'|'warehouses') {
  const table=source==='categories'?'inventory_categories':'warehouses'
  const {data,error}=await supabase.from(table).select('id,name').order('name')
  if(error) throw new Error(error.message)
  return (data ?? []) as Array<{id:string;name:string}>
}
