import { supabase } from '../supabase'
import { rupees, toRupees, roundHalfUp, type Paisa } from '../money'
import type { RecordValues } from '../recordEditor'
import type { RentalDraftData } from '../../actions/rentals/saveDraft'

export interface QuoteSnapshot { id:string; code:string; revision:string; values:RecordValues; lines:RecordValues[]; crew:RecordValues[]; transport:RecordValues|null; discounts:RecordValues[] }
const text=(v:unknown)=>typeof v==='string'?v:''
const number=(v:unknown)=>Number(v??0)
function wallClock(value:unknown){const date=new Date(text(value));if(!Number.isFinite(date.getTime()))throw new Error('This booking has an invalid date.');const local=new Date(date.getTime()+345*60000).toISOString();return [local.slice(0,10),local.slice(11,16)] as const}
export async function readQuoteEditor(id:string):Promise<QuoteSnapshot>{const {data,error}=await supabase.rpc('read_quote_editor',{p_id:id});if(error)throw new Error(error.message);if(!data || typeof data!=='object' || !('revision' in data))throw new Error('Quote could not be loaded.');return data as QuoteSnapshot}

export function quoteToDraft(snapshot:QuoteSnapshot):RentalDraftData {
  const v=snapshot.values,t=snapshot.transport??{},[pickup,pickupTime]=wallClock(v.pickup_at),[returnDate,returnTime]=wallClock(v.return_at)
  return {version:1,bookingNo:snapshot.code,selectedClientId:text(v.client_id),clientDbId:text(v.client_id),project:text(v.project),kind:text(v.project_type),kindOther:text(v.project_type_other),govId:'',pickup,pickupTime,returnDate,returnTime,deliveryType:v.delivery_type==='Babin Delivery'?'Babin Delivery':'Client Pickup',pickupLocation:text(v.pickup_location),returnLocation:text(v.return_location),specialInstructions:text(t.special_instructions),
    lines:snapshot.lines.map(l=>({id:text(l.id),bookingLineId:text(l.id),clientUuid:text(l.client_uuid),parentClientUuid:text(l.parent_client_uuid)||null,productId:text(l.product_id)||null,bundleId:text(l.bundle_id)||null,isIncluded:Boolean(l.is_included),lineType:text(l.line_type) as NonNullable<RentalDraftData['lines'][number]['lineType']>,name:text(l.name)||text(l.description),serial:'—',category:text(l.line_type),ratePaisa:rupees(number(l.rate)),days:number(l.days),daysOverridden:true,qty:number(l.qty),discountPct:number(l.rate)*number(l.days)*number(l.qty)>0?number(l.discount_amount)/(number(l.rate)*number(l.days)*number(l.qty))*100:0,location:'',committedTo:'—'})),
    crew:snapshot.crew.map(c=>({crewId:text(c.id),name:text(c.name),role:text(c.crew_role),phone:text(c.phone),dayRatePaisa:rupees(number(c.day_rate)),overtimePaisa:rupees(number(c.overtime)),accommodationPaisa:rupees(number(c.accommodation)),mealsPaisa:rupees(number(c.meals))})),
    deliveryChargePaisa:rupees(number(t.delivery_charge)),fuelChargePaisa:rupees(number(t.fuel_charge)),vehicle:text(t.vehicle),numberPlate:text(t.number_plate),driverContact:text(t.driver_contact),returnPickupType:'Client Return',discountPct:snapshot.discounts.reduce((sum,d)=>sum+number(d.percent),0),vatOn:true,vatRatePercent:13,advancePaisa:0}
}

/** Preserve database row identities and hidden metadata; only editable fields cross back. */
export function quoteUpdatePayload(data:RentalDraftData,snapshot:QuoteSnapshot,depositPaisa:Paisa) {
  const pickup=new Date(`${data.pickup}T${data.pickupTime}:00+05:45`),ret=new Date(`${data.returnDate}T${data.returnTime}:00+05:45`)
  if(!Number.isFinite(pickup.getTime())||!Number.isFinite(ret.getTime())||ret<pickup)throw new Error('Choose valid pickup and return dates.')
  if(!data.clientDbId)throw new Error('Select a client.')
  return {values:{client_id:data.clientDbId,project:data.project.trim()||null,project_type:data.kind||null,project_type_other:data.kind==='Other'?data.kindOther.trim()||null:null,pickup_at:pickup.toISOString(),return_at:ret.toISOString(),delivery_type:data.deliveryType,pickup_location:data.pickupLocation||null,return_location:data.returnLocation||null,deposit_required:toRupees(depositPaisa)},
    lines:data.lines.map((l,index)=>{
      const original=snapshot.lines.find(row=>row.id===l.bookingLineId)
      return {id:l.bookingLineId??null,client_uuid:l.clientUuid,parent_client_uuid:l.parentClientUuid??null,line_type:l.lineType??'Equipment',product_id:l.productId??null,bundle_id:l.bundleId??null,description:l.name,qty:l.qty,days:l.days,rate:toRupees(l.ratePaisa as Paisa),discount_amount:toRupees(roundHalfUp(l.ratePaisa*l.qty*l.days*l.discountPct/100) as Paisa),is_included:l.isIncluded??false,service_basis:original?.service_basis??(l.lineType==='Service'?'Per day':null),line_note:original?.line_note??(l.lineType==='Manual item'?l.name:null),sort_order:index}
    }),
    crew:data.crew.map(c=>{const original=snapshot.crew.find(row=>row.id===c.crewId);return {id:original?.id??null,crew_member_id:original?.crew_member_id??null,name:c.name,crew_role:c.role,phone:c.phone||null,day_rate:toRupees(c.dayRatePaisa as Paisa),days:original?.days??data.lines[0]?.days??1,overtime:toRupees(c.overtimePaisa as Paisa),accommodation:toRupees(c.accommodationPaisa as Paisa),meals:toRupees(c.mealsPaisa as Paisa)}}),
    transport:{vehicle:data.vehicle||null,number_plate:data.numberPlate||null,driver_contact:data.driverContact||null,delivery_charge:toRupees(((data.deliveryType==='Babin Delivery'?data.deliveryChargePaisa:0)+(data.returnPickupType==='Babin Pickup'?(data.returnPickupChargePaisa??0):0)) as Paisa),fuel_charge:toRupees((data.deliveryType==='Babin Delivery'?data.fuelChargePaisa:0) as Paisa),special_instructions:data.specialInstructions||null},discount_percent:data.discountPct}
}
