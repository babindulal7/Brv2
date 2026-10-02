import { saveRecord, type SaveRecordInput } from '../recordEditor'
import type { ActionContext } from '../core'
export type UpdateEquipmentInput = Omit<SaveRecordInput,'kind'> & {id:string;expectedRevision:string}
export function updateEquipment(input:UpdateEquipmentInput,ctx:ActionContext) { return saveRecord({...input,kind:'equipment'},ctx) }
