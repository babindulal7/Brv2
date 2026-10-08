import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import { saveRecord } from '../../actions/recordEditor'
import { updateEquipment } from '../../actions/inventory/updateEquipment'
import { recordDefaults, recordFields, recordPayload, validateRecord, type RecordField, type RecordKind, type RecordSnapshot, type RecordValues } from '../../lib/recordEditor'
import { readRecordEditor, recordEditorOptions } from '../../lib/queries/recordEditor'
import { listInventory } from '../../lib/queries/inventory'
import { findClientsByPhoneTail } from '../../lib/queries/clients'
import { Button, Card, PageHeader } from '../ui/Page'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { RecordWorkspace, RecordSection, RecordActions, RecordErrorSummary, focusRecordField, useUnsavedRecord } from '../ui/RecordWorkspace'
import { useToast } from '../ui/Toast'
import { EquipmentSectionLinks, EquipmentSummary, INTAKE_CONDITIONS, PasteSerials, equipmentSectionState, useEquipmentDuplicate } from './equipmentAssist'
import './equipment-assist.css'

export interface RecordFormProps { kind:RecordKind; recordId?:string; onDone?:()=>void }
const names={client:'Client',equipment:'Equipment',bundle:'Bundle'}
const routes={client:'/clients',equipment:'/inventory',bundle:'/inventory/bundles'}
/** Optional sections collapse while empty; essential ones are always open. */
const optionalSections:Record<RecordKind,string[]>={client:['Addresses','Commercial details','Notes'],equipment:['Purchase','Maintenance & notes'],bundle:[]}
/** Roles that may open this form. Creating a client keeps canCreateClient parity (Warehouse); editing does not. */
function rolesFor(kind:RecordKind,editing:boolean){return kind==='client'?(editing?['Owner','Admin','Manager','Coordinator']:['Owner','Admin','Manager','Coordinator','Warehouse']):['Owner','Admin','Manager']}

export function RecordForm({kind,recordId,onDone}:RecordFormProps) {
  const {user}=useAuth(); const online=useNetwork(); const navigate=useNavigate(); const location=useLocation(); const {showSuccessToast}=useToast()
  const [snapshot,setSnapshot]=useState<RecordSnapshot|null>(null)
  const [values,setValues]=useState<RecordValues>({...recordDefaults[kind]})
  const [rows,setRows]=useState<RecordValues[]>([])
  const [loading,setLoading]=useState(Boolean(recordId)); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [errors,setErrors]=useState<Record<string,string>>({})
  const [reload,setReload]=useState(0); const [options,setOptions]=useState<Record<string,Array<{id:string;name:string}>>>({}); const [search,setSearch]=useState(''); const [products,setProducts]=useState<Array<{id:string;name:string}>>([])
  const [duplicate,setDuplicate]=useState<{id:string;name:string}|null>(null)
  /** Add Equipment §3: Manufacturer shows only when it differs from Brand. */
  const [manufacturerDiffers,setManufacturerDiffers]=useState(false)
  const saved=useRef(false); const submitting=useRef(false); const saveKey=useRef<{fingerprint:string;key:string}|null>(null)
  const initial=useRef(JSON.stringify({values:{...recordDefaults[kind]},rows:[]}))
  const fingerprint=JSON.stringify({values,rows}); const dirty=!saved.current && fingerprint!==initial.current
  useUnsavedRecord(dirty)
  const permitted=Boolean(user && rolesFor(kind,Boolean(recordId)).includes(user.role))
  const equipmentDuplicate=useEquipmentDuplicate(values.name,values.model,kind==='equipment' && !recordId)
  useEffect(()=>{if(kind==='equipment' && String(values.manufacturer??'').trim())setManufacturerDiffers(true)},[kind,values.manufacturer])
  const errorBox=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(error)errorBox.current?.focus()},[error])

  useEffect(()=>{
    if(!recordId) return
    let active=true; setLoading(true); setError('')
    void readRecordEditor(kind,recordId).then(result=>{if(!active)return; setSnapshot(result);setValues(result.values);setRows(result.rows);initial.current=JSON.stringify({values:result.values,rows:result.rows});saved.current=false}).catch((e:unknown)=>{if(active)setError(e instanceof Error?e.message:String(e))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[kind,recordId,reload])
  useEffect(()=>{
    if(kind==='client')return
    let active=true
    void Promise.all([recordEditorOptions('categories'),...(kind==='equipment'?[recordEditorOptions('warehouses')]:[])]).then(([categories,warehouses])=>{if(active)setOptions({categories:categories??[],warehouses:warehouses??[]})}).catch((e:unknown)=>{if(active)setError(`Choices could not be loaded: ${e instanceof Error?e.message:String(e)}`)})
    return()=>{active=false}
  },[kind])
  useEffect(()=>{
    if(kind!=='bundle')return
    let active=true
    const timer=setTimeout(()=>{void listInventory({search}).then(result=>{if(active)setProducts(result.rows.map(p=>({id:p.id,name:p.name})))}).catch((e:unknown)=>{if(active)setError(e instanceof Error?e.message:String(e))})},200)
    return()=>{active=false;clearTimeout(timer)}
  },[kind,search])
  useEffect(()=>{
    if(kind!=='client' || !values.phone)return
    let active=true
    const timer=setTimeout(()=>{void findClientsByPhoneTail(String(values.phone)).then(matches=>{if(active){const match=matches.find(c=>c.dbId!==snapshot?.id && c.id!==snapshot?.code);setDuplicate(match?{id:match.dbId??match.id,name:match.name}:null)}}).catch(()=>{if(active)setError('Duplicate check is unavailable. The database will check the phone when you save.')})},350)
    return()=>{active=false;clearTimeout(timer)}
  },[kind,values.phone,snapshot?.id,snapshot?.code])

  const sections=useMemo(()=>{
    const result=[...new Set(recordFields[kind].map(f=>f.section))]
    if(kind==='bundle')result.splice(1,0,'Components')
    if(kind==='client')result.splice(result.indexOf('Notes'),0,'Commercial details')
    return result
  },[kind])
  const set=(key:string,value:string|boolean)=>{setValues(v=>({...v,[key]:value}));setErrors(e=>{const next={...e};delete next[key];return next})}
  function exit(){if(onDone){onDone();return} if(recordId){const params=new URLSearchParams(location.search);params.delete('action');navigate(`${location.pathname}${params.size?`?${params}`:''}`)}else navigate(kind==='bundle'?'/inventory?tab=bundles':routes[kind])}
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)

  function cancel() {
    if (!dirty) {
      exit()
      return
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Discard unsaved changes?',
      description: 'You have unsaved changes that will be lost if you leave this page.',
      confirmLabel: 'Discard',
      onConfirm: () => {
        setConfirmDialog(null)
        exit()
      },
    })
  }
  const fieldId=(key:string)=>`record-${key}`
  const sectionId=(section:string)=>`record-section-${section.toLowerCase().replace(/[^a-z]+/g,'-')}`
  const errorList=Object.entries(errors).map(([key,message])=>({id:fieldId(key),message}))
  function sectionHasValue(section:string){return recordFields[kind].some(f=>f.section===section && (f.type==='checkbox'?false:String(values[f.key]??'').trim()!=='' && String(values[f.key])!==String(recordDefaults[kind][f.key]??'')))}
  async function save(){
    if(submitting.current || !user || !permitted)return
    const invalid=validateRecord(kind,values)
    if(kind==='bundle' && !rows.length)invalid.components='Add at least one component.'
    if(kind==='equipment' && values.tracking_mode==='Serialised' && !rows.length)invalid.units='Add at least one unit.'
    setErrors(invalid)
    if(Object.keys(invalid).length){focusRecordField(fieldId(Object.keys(invalid)[0]!));return}
    submitting.current=true;setBusy(true);setError('')
    if(saveKey.current?.fingerprint!==fingerprint)saveKey.current={fingerprint,key:newClientUuid()}
    try{
      const input={kind,id:snapshot?.id??null,expectedRevision:snapshot?.revision??null,clientUuid:saveKey.current!.key,values:recordPayload(kind,values,Boolean(recordId)),rows}
      const ctx={userId:user.id,role:user.role,isOnline:online}
      const result=kind==='equipment' && snapshot?await updateEquipment({...input,id:snapshot.id,expectedRevision:snapshot.revision},ctx):await saveRecord(input,ctx)
      saved.current=true;initial.current=fingerprint
      showSuccessToast(`${names[kind]} saved`,result.code)
      if(onDone && recordId){onDone();return}
      const params=new URLSearchParams(location.search);params.delete('action');if(params.get('tab')==='new')params.delete('tab')
      navigate(`${routes[kind]}/${result.id}${params.size?`?${params}`:''}`)
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{submitting.current=false;setBusy(false)}
  }
  function renderField(f:RecordField){
    if(kind==='client' && f.key==='org_subtype' && values.type_parent!=='Organisation')return null
    if(kind==='equipment' && f.key==='total_quantity' && values.tracking_mode==='Serialised')return null
    if(kind==='equipment' && f.key==='manufacturer' && !manufacturerDiffers)return <label className="record-field record-field--inline" key="manufacturer-differs" htmlFor="record-manufacturer-differs"><input id="record-manufacturer-differs" type="checkbox" disabled={busy} checked={false} onChange={()=>setManufacturerDiffers(true)}/><span>Made by a different manufacturer than the brand</span></label>
    const disabled=busy || Boolean(recordId && f.createOnly)
    const props={id:`record-${f.key}`,disabled,'aria-invalid':Boolean(errors[f.key]),'aria-describedby':errors[f.key]?`record-${f.key}-error`:undefined}
    return <label className="record-field" key={f.key} htmlFor={props.id}><span>{f.label}{f.required?' *':''}</span>{f.type==='checkbox'?<input {...props} type="checkbox" checked={Boolean(values[f.key])} onChange={e=>set(f.key,e.target.checked)}/>:f.type==='select'?<select {...props} value={String(values[f.key]??'')} onChange={e=>set(f.key,e.target.value)}><option value="">Select…</option>{f.source?(options[f.source]??[]).map(o=><option key={o.id} value={o.id}>{o.name}</option>):f.options?.map(o=><option key={o} value={o}>{o}</option>)}</select>:f.type==='textarea'?<textarea {...props} value={String(values[f.key]??'')} onChange={e=>set(f.key,e.target.value)}/>:<input {...props} type={f.type==='date'?'date':f.type==='number'?'number':'text'} inputMode={f.type==='money'?'decimal':undefined} value={String(values[f.key]??'')} onChange={e=>set(f.key,e.target.value)}/>} {errors[f.key]&&<span id={`record-${f.key}-error`} role="alert">{errors[f.key]}</span>}</label>
  }
  function rowField(row:RecordValues,index:number,key:string,label:string,type='text'){
    return <label className="record-field" key={key}><span>{label}</span>{key==='warehouse_id'?<select disabled={busy} value={String(row[key]??'')} onChange={e=>setRows(prev=>prev.map((r,i)=>i===index?{...r,[key]:e.target.value}:r))}><option value="">Select warehouse…</option>{(options.warehouses??[]).map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select>:<input disabled={busy} type={type} min={type==='number'?1:undefined} checked={type==='checkbox'?Boolean(row[key]):undefined} value={type==='checkbox'?undefined:String(row[key]??'')} onChange={e=>setRows(prev=>prev.map((r,i)=>i===index?{...r,[key]:type==='checkbox'?e.target.checked:type==='number'?Number(e.target.value):e.target.value}:r))}/>}</label>
  }
  if(!permitted)return <Card title="Record unavailable">Your role cannot edit this record.</Card>
  if(loading)return <Card title="Loading record">Loading saved values…</Card>
  if(recordId && !snapshot)return <Card title="Record not loaded"><p role="alert">{error}</p><Button onClick={()=>setReload(r=>r+1)}>Retry</Button></Card>
  return <><PageHeader title={`${recordId?'Edit':'Add'} ${names[kind]}`}/>
    {confirmDialog && (
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        variant="danger"
        onClose={() => setConfirmDialog(null)}
        onConfirm={confirmDialog.onConfirm}
      />
    )}
    {error&&<div ref={errorBox} tabIndex={-1}><Card title="Not saved"><p role="alert">{error}</p>{recordId&&<Button onClick={()=>{
      if(!dirty) { setReload(r=>r+1); return }
      setConfirmDialog({
        isOpen: true,
        title: 'Discard your edits?',
        description: 'Discard your unsaved edits and reload the latest record?',
        confirmLabel: 'Reload',
        onConfirm: () => { setConfirmDialog(null); setReload(r=>r+1) },
      })
    }}>Reload latest record</Button>}</Card></div>}
    <RecordErrorSummary errors={errorList}/>
    {duplicate&&<Card title="This phone belongs to an existing client"><p>{duplicate.name}</p><Button onClick={()=>{
      if(!dirty) { navigate(`/clients/${duplicate.id}`); return }
      setConfirmDialog({
        isOpen: true,
        title: 'Discard unsaved changes?',
        description: 'Discard current unsaved changes and open the existing client?',
        confirmLabel: 'Open Client',
        onConfirm: () => { setConfirmDialog(null); navigate(`/clients/${duplicate.id}`) },
      })
    }}>Open existing client</Button></Card>}
    {equipmentDuplicate&&<Card title="Equipment with this name already exists"><p>{equipmentDuplicate.name} is already in the catalogue. Add units to it instead of creating a second record.</p><Button onClick={()=>{
      if(!dirty) { navigate(`/inventory/${equipmentDuplicate.id}`); return }
      setConfirmDialog({
        isOpen: true,
        title: 'Discard unsaved changes?',
        description: 'Discard current unsaved changes and open the existing equipment?',
        confirmLabel: 'Open Equipment',
        onConfirm: () => { setConfirmDialog(null); navigate(`/inventory/${equipmentDuplicate.id}`) },
      })
    }}>Open existing equipment</Button></Card>}
    <RecordWorkspace summary={kind==='equipment'?<EquipmentSummary values={values} rows={rows} categoryName={(options.categories??[]).find(c=>c.id===values.category_id)?.name} editing={Boolean(recordId)}/>:<Card title={`${names[kind]} summary`}><strong>{String(values.name||`New ${kind}`)}</strong><p>{recordId?'Editing the existing record.':'A new record will be created.'}</p>{kind!=='client'&&<p>{rows.length} {kind==='bundle'?'components':'units'}</p>}</Card>} actions={<RecordActions busy={busy} dirty={dirty || !recordId} label={recordId?'Save changes':`Create ${kind}`} onSave={()=>void save()} onCancel={cancel}/> }>
      {kind==='equipment'&&<EquipmentSectionLinks sections={sections} stateOf={section=>equipmentSectionState(section,values,rows)} idOf={sectionId}/>}
      {sections.map(section=><RecordSection key={section} title={section} id={sectionId(section)} collapsible={optionalSections[kind].includes(section)} defaultOpen={!optionalSections[kind].includes(section)||sectionHasValue(section)||(section==='Notes'&&false)} collapsedHint="Empty"><div className="record-fields">{recordFields[kind].filter(f=>f.section===section).map(renderField)}</div>
        {kind==='client'&&section==='Contact'&&<><h3>Primary contact</h3>{rows.map((row,index)=><div className="record-fields" key={String(row.id??index)}>{rowField(row,index,'full_name','Contact name')}{rowField(row,index,'designation','Designation')}{rowField(row,index,'phone','Contact phone')}{rowField(row,index,'email','Contact email')}<Button disabled={busy} onClick={()=>setRows([])}>Remove primary contact</Button></div>)}{!rows.length&&<Button disabled={busy} onClick={()=>setRows([{full_name:'',designation:null,phone:null,email:null}])}>Add primary contact</Button>}</>}
        {kind==='client'&&section==='Commercial details'&&<p>Membership and credit terms are managed from the client’s dedicated actions.</p>}
        {kind==='equipment'&&section==='Units & location'&&values.tracking_mode==='Serialised'&&<div id="record-units" tabIndex={-1}>{rows.map((row,index)=><Card key={String(row.id??index)} title={String(row.asset_tag||`Unit ${index+1}`)}><div className="record-fields">{recordId&&rowField(row,index,'asset_tag','Asset tag')}{rowField(row,index,'serial_no','Serial number')}{rowField(row,index,'warehouse_id','Warehouse')}{rowField(row,index,'rack','Rack')}{rowField(row,index,'shelf','Shelf')}{rowField(row,index,'bin','Bin')}{!recordId&&<label className="record-field" htmlFor={`record-unit-${index}-condition`}><span>Condition at intake</span><select id={`record-unit-${index}-condition`} disabled={busy} value={String(row.condition??'Excellent')} onChange={e=>setRows(prev=>prev.map((r,i)=>i===index?{...r,condition:e.target.value}:r))}>{INTAKE_CONDITIONS.map(c=><option key={c} value={c}>{c}</option>)}</select></label>}</div>{recordId?<p>{String(row.status)} · {String(row.condition)}</p>:<Button disabled={busy} onClick={()=>setRows(prev=>prev.filter((_,i)=>i!==index))}>Remove unit</Button>}</Card>)}{!recordId&&<Button disabled={busy} onClick={()=>setRows(prev=>[...prev,{serial_no:null,warehouse_id:prev[prev.length-1]?.warehouse_id??null,rack:null,shelf:null,bin:null,condition:'Excellent'}])}>Add unit</Button>}{!recordId&&<PasteSerials existing={rows.map(r=>r.serial_no)} disabled={busy} onAdd={serials=>setRows(prev=>[...prev,...serials.map(serial=>({serial_no:serial,warehouse_id:prev[prev.length-1]?.warehouse_id??null,rack:null,shelf:null,bin:null,condition:'Excellent'}))])}/>}{recordId&&<p>Use stock adjustments or intake to change unit counts; use operational actions to change condition or custody.</p>}</div>}
        {kind==='bundle'&&section==='Components'&&<div id="record-components" tabIndex={-1}><label className="record-field"><span>Find equipment</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search equipment…"/></label><div>{products.filter(p=>!rows.some(r=>r.product_id===p.id)).map(p=><Button disabled={busy} key={p.id} onClick={()=>setRows(prev=>[...prev,{product_id:p.id,name:p.name,quantity:1,days:1,is_mandatory:true,sort_order:prev.length}])}>Add {p.name}</Button>)}</div>{rows.map((row,index)=><Card key={String(row.id??row.product_id)} title={String(row.name??'Component')}><div className="record-fields">{rowField(row,index,'quantity','Quantity','number')}{rowField(row,index,'days','Days','number')}{rowField(row,index,'is_mandatory','Required component','checkbox')}<Button disabled={busy} onClick={()=>setRows(prev=>prev.filter((_,i)=>i!==index))}>Remove component</Button></div></Card>)}</div>}
      </RecordSection>)}
    </RecordWorkspace></>
}
