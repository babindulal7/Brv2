// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ToastProvider } from '../../ui/Toast'

const role = vi.hoisted(() => ({ current: 'Owner' }))
const keys = vi.hoisted(() => ({ n: 0 }))
const saveRecord = vi.hoisted(() => vi.fn())
const updateEquipment = vi.hoisted(() => vi.fn())
const readRecordEditor = vi.hoisted(() => vi.fn())
const inventoryRows = vi.hoisted(() => ({ current: [] as Array<{ id: string; name: string; model: string | null }> }))

vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u-1', name: 'T', role: role.current }, loading: false, isLocked: false }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => true }))
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => `key-${++keys.n}` }))
vi.mock('../../../actions/recordEditor', () => ({ saveRecord }))
vi.mock('../../../actions/inventory/updateEquipment', () => ({ updateEquipment }))
vi.mock('../../../lib/queries/recordEditor', () => ({
  readRecordEditor,
  recordEditorOptions: async () => [{ id: 'c1', name: 'Cameras' }],
}))
vi.mock('../../../lib/queries/inventory', () => ({ listInventory: async () => ({ rows: inventoryRows.current }) }))
vi.mock('../../../lib/queries/clients', () => ({ findClientsByPhoneTail: async () => [] }))

window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
Element.prototype.scrollIntoView = () => {}
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { RecordForm } = await import('../RecordForm')

let container: HTMLDivElement
let root: Root

function Probe() {
  const l = useLocation()
  return <span data-testid="where">{l.pathname}{l.search}</span>
}
async function mount(kind: 'client' | 'equipment' | 'bundle', recordId?: string, path = '/clients?tab=new&q=rai') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="*" element={<><RecordForm kind={kind} {...(recordId ? { recordId } : {})} /><Probe /></>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
}
const field = (key: string) => container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#record-${key}`)
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined
async function type(key: string, value: string) {
  const el = field(key)
  if (!el) throw new Error(`no field ${key}`)
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
const click = async (el: Element | undefined | null) => { await act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })) }) }
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 40)) })
const sectionTitles = () => [...container.querySelectorAll('[data-record-section]')].map((s) => s.querySelector('h2')!.textContent)
const where = () => container.querySelector('[data-testid="where"]')!.textContent

const clientSnapshot = {
  id: 'cl-1', code: 'CL-0001', revision: 'rev-1',
  values: { type_parent: 'Organisation', org_subtype: 'Production House', name: 'Stored Films', phone: '+9779801234567', email: 'hello@stored.test', pan_vat: '123456789', country: 'Nepal', city: 'Pokhara', notes: 'Stored note' },
  rows: [{ id: 'ct-1', full_name: 'Sita Rai', designation: null, phone: null, email: null }],
}

beforeEach(() => {
  role.current = 'Owner'
  keys.n = 0
  saveRecord.mockReset()
  updateEquipment.mockReset()
  readRecordEditor.mockReset()
  inventoryRows.current = []
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('RecordForm - shared client form (Add)', () => {
  it('lays sections out Identity > Contact > Addresses > Commercial details > Notes', async () => {
    await mount('client')
    const titles = sectionTitles()
    expect(titles).toEqual(['Identity', 'Contact', 'Addresses', 'Commercial details', 'Notes'])
  })

  it('collapses empty optional sections but keeps essential ones open', async () => {
    await mount('client')
    const open = [...container.querySelectorAll<HTMLElement>('[data-record-section]')].map((s) => s.dataset.open)
    expect(open).toEqual(['true', 'true', 'false', 'false', 'false'])
  })

  /* UPDATED: the bar was exactly Cancel / Create client. Create & add another
     now sits in `RecordActions`' `extra` slot — the slot UI_UX_RULES §Action bar
     reserves for added actions — so a run of new clients is not
     Create → back → Add → Create each time (md brief 20, R-39). */
  it('has one persistent action bar: Cancel / Create & add another / Create client', async () => {
    await mount('client')
    const bar = container.querySelector('[aria-label="Record actions"]')!
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Create & add another', 'Create client'])
  })

  it('refuses an invalid save, shows inline errors and a clickable summary, and writes nothing', async () => {
    await mount('client')
    await type('phone', '12345')
    await type('pan_vat', '12')
    await click(button('Create client'))
    expect(saveRecord).not.toHaveBeenCalled()
    expect(field('name')!.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('#record-phone-error')!.textContent).toContain('10-digit Nepali mobile')
    expect(container.querySelector('#record-pan_vat-error')!.textContent).toContain('exactly nine digits')
    const summary = container.querySelector('.record-error-summary')!
    expect(summary.textContent).toContain('Name is required.')
    await click([...summary.querySelectorAll('button')].find((b) => b.textContent?.includes('PAN/VAT')))
    await flush()
    expect(document.activeElement?.id).toBe('record-pan_vat')
  })

  it('submits canonical phone once, even on a double click, and lands on the new record keeping its context', async () => {
    let resolve!: (v: unknown) => void
    saveRecord.mockReturnValue(new Promise((r) => { resolve = r }))
    await mount('client')
    await type('name', 'Fresh Films')
    await type('phone', '9801234567')
    await click(button('Create client'))
    await click(button('Create client'))
    expect(saveRecord).toHaveBeenCalledTimes(1)
    const input = saveRecord.mock.calls[0]![0]
    expect(input.id).toBeNull()
    expect(input.values.phone).toBe('+9779801234567')
    expect(button('Cancel')!.disabled).toBe(true)
    await act(async () => { resolve({ id: 'new-1', code: 'CL-0002', revision: 'r', values: {}, rows: [] }) })
    await flush()
    expect(where()).toBe('/clients/new-1?q=rai')
  })

  it('keeps every entry after a failed save and retries with the SAME idempotency key', async () => {
    saveRecord.mockRejectedValueOnce(new Error('A client with this phone number already exists.'))
    saveRecord.mockResolvedValueOnce({ id: 'new-1', code: 'CL-0002', revision: 'r', values: {}, rows: [] })
    await mount('client')
    await type('name', 'Fresh Films')
    await type('phone', '9801234567')
    await type('notes', 'keep me')
    await click(button('Create client'))
    expect(container.textContent).toContain('already exists')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect((field('name') as HTMLInputElement).value).toBe('Fresh Films')
    expect((field('notes') as HTMLTextAreaElement).value).toBe('keep me')
    expect(button('Create client')!.disabled).toBe(false)
    await click(button('Create client'))
    expect(saveRecord).toHaveBeenCalledTimes(2)
    expect(saveRecord.mock.calls[1]![0].clientUuid).toBe(saveRecord.mock.calls[0]![0].clientUuid)
  })

  it('mints a new key when the operator changes the content after a failure', async () => {
    saveRecord.mockRejectedValue(new Error('nope'))
    await mount('client')
    await type('name', 'A Films')
    await type('phone', '9801234567')
    await click(button('Create client'))
    await type('name', 'B Films')
    await click(button('Create client'))
    expect(saveRecord.mock.calls[1]![0].clientUuid).not.toBe(saveRecord.mock.calls[0]![0].clientUuid)
  })

  it('Create & add another saves, stays on the page and hands back a blank, clean form', async () => {
    saveRecord.mockResolvedValue({ id: 'new-1', code: 'CL-0002', revision: 'r', values: {}, rows: [] })
    await mount('client')
    await type('name', 'Fresh Films')
    await type('phone', '9801234567')
    await type('notes', 'first one')
    await click(button('Create & add another'))
    await flush()
    expect(saveRecord).toHaveBeenCalledTimes(1)
    expect(saveRecord.mock.calls[0]![0].values.name).toBe('Fresh Films')
    expect(where()).toBe('/clients?tab=new&q=rai')
    expect((field('name') as HTMLInputElement).value).toBe('')
    expect((field('phone') as HTMLInputElement).value).toBe('')
    expect((field('notes') as HTMLTextAreaElement).value).toBe('')
    expect(container.textContent).toContain('CL-0002')
    // Clean, not merely blank: Cancel leaves at once instead of asking to discard.
    await click(button('Cancel'))
    expect(container.textContent).not.toContain('Discard unsaved changes?')
    expect(where()).toBe('/clients')
  })

  it('gives the next record a NEW idempotency key, even when its content is identical', async () => {
    /* The AddClient replay bug: the second record carried the first one's key,
       `client_uuid` matched, and the database handed back the FIRST client as
       the second one's "success". Same typed content is the hardest case — the
       fingerprint-keyed reuse would match it — so it is the one pinned. */
    saveRecord.mockResolvedValue({ id: 'new-1', code: 'CL-0002', revision: 'r', values: {}, rows: [] })
    await mount('client')
    await type('name', 'Same Films')
    await type('phone', '9801234567')
    await click(button('Create & add another'))
    await flush()
    await type('name', 'Same Films')
    await type('phone', '9801234567')
    await click(button('Create & add another'))
    await flush()
    expect(saveRecord).toHaveBeenCalledTimes(2)
    expect(saveRecord.mock.calls[1]![0].clientUuid).not.toBe(saveRecord.mock.calls[0]![0].clientUuid)
  })

  it('keeps the entries and offers the same key again when Create & add another fails', async () => {
    saveRecord.mockRejectedValueOnce(new Error('A client with this phone number already exists.'))
    await mount('client')
    await type('name', 'Fresh Films')
    await type('phone', '9801234567')
    await click(button('Create & add another'))
    await flush()
    expect(container.textContent).toContain('already exists')
    expect((field('name') as HTMLInputElement).value).toBe('Fresh Films')
    expect(where()).toBe('/clients?tab=new&q=rai')
  })

  it('offers Create & add another on new equipment, but never on a bundle or an edit', async () => {
    await mount('equipment', undefined, '/inventory/new')
    expect(button('Create & add another')).toBeDefined()
    await act(async () => root.unmount())
    container.remove()
    await mount('bundle', undefined, '/inventory/bundles/new')
    expect(button('Create & add another')).toBeUndefined()
    await act(async () => root.unmount())
    container.remove()
    readRecordEditor.mockResolvedValue(clientSnapshot)
    await mount('client', 'cl-1', '/clients/cl-1?action=edit')
    expect(button('Create & add another')).toBeUndefined()
  })

  it('lets Warehouse create a client but not open the editor on an existing one', async () => {
    role.current = 'Warehouse'
    await mount('client')
    expect(field('name')).not.toBeNull()
    await act(async () => root.unmount())
    container.remove()
    readRecordEditor.mockResolvedValue(clientSnapshot)
    await mount('client', 'cl-1', '/clients/cl-1?action=edit')
    expect(container.textContent).toContain('Your role cannot edit this record.')
  })
})

describe('RecordForm - same form prefilled (Edit)', () => {
  beforeEach(() => { readRecordEditor.mockResolvedValue(clientSnapshot) })

  it('shows the same section order and labels, with stored values prefilled', async () => {
    await mount('client', 'cl-1', '/clients/cl-1?action=edit')
    const titles = sectionTitles()
    expect(titles).toEqual(['Identity', 'Contact', 'Addresses', 'Commercial details', 'Notes'])
    expect((field('name') as HTMLInputElement).value).toBe('Stored Films')
    expect((field('city') as HTMLInputElement).value).toBe('Pokhara')
    expect((field('notes') as HTMLTextAreaElement).value).toBe('Stored note')
    const bar = container.querySelector('[aria-label="Record actions"]')!
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Save changes'])
  })

  it('opens optional sections that already hold data', async () => {
    await mount('client', 'cl-1', '/clients/cl-1?action=edit')
    const open = [...container.querySelectorAll<HTMLElement>('[data-record-section]')].map((s) => s.dataset.open)
    expect(open).toEqual(['true', 'true', 'true', 'false', 'true'])
  })

  it('Save changes is disabled until something changes, then sends the revision and the stored row id', async () => {
    saveRecord.mockResolvedValue({ ...clientSnapshot, revision: 'rev-2' })
    await mount('client', 'cl-1', '/clients/cl-1?action=edit&tab=overview')
    expect(button('Save changes')!.disabled).toBe(true)
    await type('name', 'Stored Films Ltd')
    expect(button('Save changes')!.disabled).toBe(false)
    await click(button('Save changes'))
    const input = saveRecord.mock.calls[0]![0]
    expect(input.id).toBe('cl-1')
    expect(input.expectedRevision).toBe('rev-1')
    expect(input.values.name).toBe('Stored Films Ltd')
    expect(input.rows[0].id).toBe('ct-1')
    await flush()
    expect(where()).toBe('/clients/cl-1?tab=overview')
  })

  it('on a concurrent change it preserves the draft and requires a reload before retrying', async () => {
    saveRecord.mockRejectedValue(new Error('This record changed since you opened it. Reload the latest record before saving.'))
    await mount('client', 'cl-1', '/clients/cl-1?action=edit')
    await type('name', 'My unsaved name')
    await click(button('Save changes'))
    expect(container.textContent).toContain('changed since you opened it')
    expect((field('name') as HTMLInputElement).value).toBe('My unsaved name')
    expect(button('Reload latest record')).toBeDefined()
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })

  it('Cancel on a clean edit leaves without asking and without writing', async () => {
    await mount('client', 'cl-1', '/clients/cl-1?action=edit&tab=overview')
    await click(button('Cancel'))
    expect(saveRecord).not.toHaveBeenCalled()
    expect(where()).toBe('/clients/cl-1?tab=overview')
  })

  it('Cancel on a dirty edit asks first and keeps the stored record on Keep editing', async () => {
    await mount('client', 'cl-1', '/clients/cl-1?action=edit')
    await type('name', 'Changed')
    await click(button('Cancel'))
    expect(document.body.textContent).toContain('Discard unsaved changes?')
    await click([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel' && b.closest('[role="dialog"]')))
    expect(saveRecord).not.toHaveBeenCalled()
    expect((field('name') as HTMLInputElement).value).toBe('Changed')
  })
})

describe('RecordForm - equipment edit', () => {
  const equipment = {
    id: 'eq-1', code: 'EQ-0001', revision: 'rev-e1',
    values: { name: 'FX3', brand: 'Sony', category_id: 'c1', tracking_mode: 'Serialised', total_quantity: 3, quantity_unit: 'piece', daily_rate: 4000, rental_enabled: true },
    rows: [{ id: 'u-1', asset_tag: 'EQ-0001-01', serial_no: 'SN1', warehouse_id: 'w1', rack: null, shelf: null, bin: null, condition: 'Good', status: 'In Stock' }],
  }

  it('saves through updateEquipment, fixes tracking mode, and never offers unit add/remove or condition edits', async () => {
    readRecordEditor.mockResolvedValue(equipment)
    updateEquipment.mockResolvedValue({ ...equipment, revision: 'rev-e2' })
    await mount('equipment', 'eq-1', '/inventory/eq-1?action=edit')
    const titles = sectionTitles()
    expect(titles).toEqual(['Identity', 'Units & location', 'Purchase', 'Pricing', 'Maintenance & notes'])
    expect((field('tracking_mode') as HTMLSelectElement).disabled).toBe(true)
    expect(button('Add unit')).toBeUndefined()
    expect(button('Remove unit')).toBeUndefined()
    expect(container.textContent).toContain('operational actions to change condition or custody')
    await type('daily_rate', '4500')
    await click(button('Save changes'))
    expect(saveRecord).not.toHaveBeenCalled()
    const input = updateEquipment.mock.calls[0]![0]
    expect(input.id).toBe('eq-1')
    expect(input.expectedRevision).toBe('rev-e1')
    expect(input.values).not.toHaveProperty('tracking_mode')
    expect(input.values).not.toHaveProperty('total_quantity')
  })
})

describe('RecordForm - equipment add assists (Add Equipment v3.0, 8 Oct 2026)', () => {
  async function fillIdentity(name = 'Aputure LS 600d') {
    await type('name', name)
    await type('brand', 'Aputure')
    await type('category_id', 'c1')
  }

  it('pastes serials, skips repeats, lets each unit pick its intake condition, and saves those rows', async () => {
    saveRecord.mockResolvedValue({ id: 'eq-9', code: 'EQ-0009' })
    await mount('equipment', undefined, '/inventory?tab=new')
    await fillIdentity()
    await type('paste-serials', ['SN1', 'SN2', 'sn2'].join(String.fromCharCode(10)))
    await click(button('Add 2 units'))
    expect(container.textContent).toContain('2 units added; 1 repeated serial skipped.')
    const condition = container.querySelector<HTMLSelectElement>('#record-unit-1-condition')!
    expect([...condition.options].map((o) => o.value)).toEqual(['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'])
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(condition, 'Good')
      condition.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(button('Create equipment'))
    const rows = saveRecord.mock.calls[0]![0].rows
    expect(rows.map((r: { serial_no: string; condition: string }) => [r.serial_no, r.condition])).toEqual([['SN1', 'Excellent'], ['SN2', 'Good']])
  })

  it('hides Manufacturer until the operator says it differs from the brand', async () => {
    await mount('equipment', undefined, '/inventory?tab=new')
    expect(field('manufacturer')).toBeNull()
    await click(container.querySelector('#record-manufacturer-differs'))
    expect(field('manufacturer')).not.toBeNull()
  })

  /* Merge of md-brief-gaps into the trunk, 8 Oct 2026: Create & add another
     (RULING 2026-10-08 row 3, "nothing carries over") met the trunk's
     manufacturer toggle, which lives outside `values` and so outlived the reset. */
  it('Create & add another on equipment also puts Manufacturer back behind its toggle', async () => {
    saveRecord.mockResolvedValue({ id: 'eq-10', code: 'EQ-0010' })
    await mount('equipment', undefined, '/inventory?tab=new')
    await fillIdentity()
    await type('paste-serials', 'SN1')
    await click(button('Add 1 unit'))
    await click(container.querySelector('#record-manufacturer-differs'))
    expect(field('manufacturer')).not.toBeNull()
    await click(button('Create & add another'))
    await flush()
    expect(saveRecord).toHaveBeenCalledTimes(1)
    expect(field('manufacturer')).toBeNull()
    expect(container.querySelector('#record-manufacturer-differs')).not.toBeNull()
  })

  it('warns when equipment with the same name already exists, and links to it', async () => {
    inventoryRows.current = [{ id: 'p-1', name: 'Sony FX3', model: null }]
    await mount('equipment', undefined, '/inventory?tab=new')
    await type('name', 'sony fx3')
    await act(async () => { await new Promise((r) => setTimeout(r, 420)) })
    expect(container.textContent).toContain('Equipment with this name already exists')
    expect(button('Open existing equipment')).toBeDefined()
  })

  it('shows section links and a live Ready-to-rent list that never blocks saving', async () => {
    saveRecord.mockResolvedValue({ id: 'eq-9', code: 'EQ-0009' })
    await mount('equipment', undefined, '/inventory?tab=new')
    const links = () => [...container.querySelectorAll('nav[aria-label="Form sections"] a')].map((a) => a.textContent)
    expect(links()).toEqual(['Identity, needs attention', 'Units & location, needs attention', 'Purchase, optional', 'Pricing, needs attention', 'Maintenance & notes, optional'])
    await fillIdentity()
    expect(links()[0]).toBe('Identity, complete')
    expect(container.textContent).toContain('Daily rate not set')
    await type('paste-serials', 'SN1')
    await click(button('Add 1 unit'))
    await click(button('Create equipment'))
    expect(saveRecord).toHaveBeenCalledTimes(1)
  })
})
