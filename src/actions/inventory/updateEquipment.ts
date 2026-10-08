import { createAction, type ActionConfig } from '../core'
import { saveRecord, type SaveRecordInput } from '../recordEditor'
import type { RecordSnapshot } from '../../lib/recordEditor'

export type UpdateEquipmentInput = Omit<SaveRecordInput, 'kind'> & { id: string; expectedRevision: string }

export const updateEquipmentConfig: ActionConfig<UpdateEquipmentInput, RecordSnapshot> = {
  name: 'UPDATE_EQUIPMENT',
  permissions: ['inventory.update'],
  implemented: true,
  validate(input) {
    if (!input.id || !input.expectedRevision || !input.clientUuid) {
      throw new Error('Reload the equipment record before saving.')
    }
  },
  async execute(input, ctx) {
    const result = await saveRecord({ ...input, kind: 'equipment' }, ctx)
    return { result, events: [] }
  },
}

export const updateEquipment = createAction(updateEquipmentConfig)
