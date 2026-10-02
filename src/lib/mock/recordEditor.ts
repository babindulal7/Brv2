import { recordFields, type RecordKind } from '../recordEditor'
import type { Row, Store } from './engine'

const tables={client:'clients',equipment:'products',bundle:'bundles'}
const children={client:'client_contacts',equipment:'product_units',bundle:'bundle_items'}
const fks={client:'client_id',equipment:'product_id',bundle:'bundle_id'}
const codes={client:'client_code',equipment:'asset_code',bundle:'bundle_code'}
function pick(row:Row,keys:string[]):Row {return Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]))}
export function readEditor(store:Store,kind:RecordKind,id:string) {
  const parent=store[tables[kind]]?.find(r=>r.id===id || r[codes[kind]]===id)
  if(!parent)throw new Error('Record not found.')
  const keys=kind==='client'?['id','full_name','designation','phone','email']:kind==='equipment'?['id','asset_tag','serial_no','warehouse_id','rack','shelf','bin','condition','status']:['id','product_id','quantity','days','is_mandatory','sort_order']
  const rows=(store[children[kind]]??[]).filter(r=>r[fks[kind]]===parent.id && (kind==='client'?r.is_primary && r.status!=='Inactive':kind==='bundle'?r.is_active!==false:true)).map(r=>({...pick(r,keys),...(kind==='bundle'?{name:store.products?.find(p=>p.id===r.product_id)?.name??'Equipment'}:{})}))
  const result={id:parent.id,code:parent[codes[kind]],values:pick(parent,recordFields[kind].map(f=>f.key)),rows}
  return {...result,revision:JSON.stringify({...result,updated_at:parent.updated_at})}
}
export function saveEditor(store:Store,args:Record<string,unknown>,actor:string,number:(kind:string)=>string) {
  const kind=args.p_kind as RecordKind
  if(!(kind in tables))throw new Error('Unknown record kind')
  const id=args.p_id as string|null
  const values=args.p_values as Row
  const inputRows=args.p_rows as Row[]
  const key=String(args.p_key)
  const request=JSON.stringify(args)
  const receipt=store.record_editor_receipts?.find(r=>r.id===key)
  if(receipt){if(receipt.actor!==actor||receipt.request!==request)throw new Error('This save key belongs to a different change.');return receipt.response}
  const parent=id?store[tables[kind]]?.find(r=>r.id===id):null
  if(id && (!parent || readEditor(store,kind,id).revision!==args.p_revision))throw new Error('This record changed since you opened it. Reload the latest record before saving.')
  const allowed=recordFields[kind].filter(f=>!id || !f.createOnly).map(f=>f.key)
  if(Object.keys(values).some(k=>!allowed.includes(k)))throw new Error('One of these fields cannot be edited here.')
  if(!String(values.name??parent?.name??'').trim())throw new Error('Name is required.')
  if(kind==='client'){
    if(!/^\+977(97|98)\d{8}$/.test(String(values.phone)))throw new Error('Enter a valid Nepali mobile number.')
    if(store.clients?.some(r=>r.id!==id && r.phone===values.phone))throw new Error('This phone belongs to an existing client.')
    if(values.pan_vat&&!/^\d{9}$/.test(String(values.pan_vat)))throw new Error('PAN/VAT must be exactly nine digits.')
    if(inputRows.length>1)throw new Error('Only one primary contact is supported.')
  }
  if(kind==='bundle'&&!inputRows.length)throw new Error('Add at least one component.')
  const current=(store[children[kind]]??[]).filter(r=>r[fks[kind]]===id)
  for(const row of inputRows){
    const existing=row.id?current.find(r=>r.id===row.id):undefined
    if(row.id&&!existing)throw new Error('This row does not belong to the record.')
    if(kind==='equipment'){
      if(id&&!existing)throw new Error('Use intake to add units.')
      if(existing&&(existing.status!==row.status||existing.condition!==row.condition))throw new Error('Use the operational workflow to change condition or custody.')
      if(!store.warehouses?.some(w=>w.id===row.warehouse_id))throw new Error('Select a warehouse for every unit.')
      if(existing&&!['In Stock','Reserved'].includes(String(existing.status))&&['warehouse_id','rack','shelf','bin'].some(k=>row[k]!==existing[k]))throw new Error('Location changes require equipment in stock or reserved.')
    }
    if(kind==='bundle'&&(!store.products?.some(p=>p.id===row.product_id)||!Number.isInteger(row.quantity)||Number(row.quantity)<1||!Number.isInteger(row.days)||Number(row.days)<1))throw new Error('Choose valid equipment, quantity and days.')
    if(kind==='client'&&!String(row.full_name??'').trim())throw new Error('Contact name is required.')
  }
  if(kind==='equipment'&&id&&current.some(r=>!inputRows.some(v=>v.id===r.id)))throw new Error('Units cannot be removed here.')
  const now=new Date().toISOString()
  const entityId=id??crypto.randomUUID()
  const code=parent?.[codes[kind]]??number(kind==='client'?'client':kind==='equipment'?'equipment':'bundle')
  const next:Row={...(parent??{id:entityId,client_uuid:key,created_at:now,created_by:actor,status:'Active',is_active:true}),...values,[codes[kind]]:code,updated_at:now}
  if(kind==='equipment'&&!id&&values.tracking_mode==='Serialised'){if(!inputRows.length)throw new Error('Add at least one unit.');next.total_quantity=inputRows.length}
  const written=inputRows.map((row,index)=>({...current.find(r=>r.id===row.id),...row,id:row.id??crypto.randomUUID(),client_uuid:current.find(r=>r.id===row.id)?.client_uuid??crypto.randomUUID(),[fks[kind]]:entityId,...(kind==='client'?{is_primary:true,status:'Active'}:{}),...(kind==='bundle'?{is_active:true}:{}),...(kind==='equipment'&&!row.id?{asset_tag:`${String(code)}-${String(index+1).padStart(2,'0')}`,status:'In Stock',condition:row.condition??'Excellent',branch_id:store.warehouses?.find(w=>w.id===row.warehouse_id)?.branch_id}:{}),updated_at:now}))
  store[tables[kind]]=[...(store[tables[kind]]??[]).filter(r=>r.id!==entityId),next]
  store[children[kind]]=[...(store[children[kind]]??[]).filter(r=>!written.some(w=>w.id===r.id)).map(r=>r[fks[kind]]===entityId&&kind==='bundle'?{...r,is_active:false,deactivated_at:now,deactivated_by:actor}:r[fks[kind]]===entityId&&kind==='client'?{...r,is_primary:false,status:'Inactive',deactivated_at:now,deactivated_by:actor}:r),...written]
  const response=readEditor(store,kind,entityId)
  ;(store.record_editor_receipts??=[]).push({id:key,actor,request,response})
  return response
}
