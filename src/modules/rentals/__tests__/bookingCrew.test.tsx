// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { AssignCrewModal } from '../modals/AssignCrewModal'
import { BookingCrewList } from '../BookingCrewList'
const mocks = vi.hoisted(() => ({ role: 'Owner', roster: vi.fn(), list: vi.fn(), save: vi.fn(), uuid: vi.fn() }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'owner-id', role: mocks.role } }) }))
vi.mock('../../../lib/supabase', () => ({ newClientUuid: mocks.uuid }))
vi.mock('../../../lib/queries/bookingCrew', () => ({ listAssignableCrew: mocks.roster, listBookingCrew: mocks.list }))
vi.mock('../../../actions/crew/bookCrew', () => ({ bookCrew: mocks.save }))
vi.mock('../../../components/ui/Modal', () => ({ Modal: ({ isOpen, children, footer }: { isOpen: boolean; children: React.ReactNode; footer: React.ReactNode }) => isOpen ? <div role="dialog">{children}{footer}</div> : null }))
let root: Root, host: HTMLDivElement
const props = () => ({ isOpen: true, onClose: vi.fn(), onSuccess: vi.fn(), bookingId: 'booking-uuid', bookingNo: 'B-1', pickupAt: '2026-09-13T04:15:00Z', returnAt: '2026-09-15T04:15:00Z', defaultDays: 2 })
async function render(element: React.ReactNode) { await act(async () => { root.render(element) }) }
async function pick() { await act(async () => { const select = host.querySelector('select')!; select.value = 'crew-uuid'; select.dispatchEvent(new Event('change', { bubbles: true })) }) }
async function submit() { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks(); mocks.role = 'Owner'
  mocks.uuid.mockReturnValue('request-uuid')
  mocks.roster.mockResolvedValue([{ id: 'crew-uuid', name: 'Mina Rai', role: 'Audio', dailyRate: 2500 }])
  mocks.list.mockResolvedValue([])
  mocks.save.mockResolvedValue({ success: true, count: 1, assignmentIds: ['assignment-uuid'] })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
describe('booking-scoped crew form', () => {
  it('sends the selected live crew, booking UUID, Nepal times and explicit rate/days', async () => {
    const p = props(); await render(<AssignCrewModal {...p} />); await pick(); await submit()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'booking-uuid', crewIds: ['crew-uuid'], role: 'Audio', dailyRate: 2500, days: 2, callTime: '2026-09-13T04:15:00.000Z', wrapTime: '2026-09-15T04:15:00.000Z', clientUuid: 'request-uuid' }), { userId: 'owner-id', role: 'Owner' })
    expect(p.onSuccess).toHaveBeenCalledWith({ name: 'Mina Rai', role: 'Audio' }); expect(p.onClose).toHaveBeenCalledOnce()
  })
  it('keeps an error visible and reuses the request UUID after a failed save', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Connection failed'))
    const p = props(); await render(<AssignCrewModal {...p} />); await pick(); await submit()
    expect(host.textContent).toContain('Connection failed'); expect(p.onSuccess).not.toHaveBeenCalled()
    await submit(); expect(mocks.uuid).toHaveBeenCalledOnce(); expect(p.onSuccess).toHaveBeenCalledOnce()
  })
  it('does not save without a selected person', async () => {
    await render(<AssignCrewModal {...props()} />); await submit(); expect(mocks.save).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
  })
  it('shows an empty roster without sample people', async () => {
    mocks.roster.mockResolvedValue([]); await render(<AssignCrewModal {...props()} />)
    expect(host.textContent).toContain('No active crew profiles'); expect(host.querySelector('select')).toBeNull()
  })
  it('shows roster read failure and can retry', async () => {
    mocks.roster.mockRejectedValueOnce(new Error('Roster connection failed'))
    await render(<AssignCrewModal {...props()} />); expect(host.textContent).toContain('Roster connection failed')
    await act(async () => { [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry roster')!.click() })
    expect(host.querySelector('select')).not.toBeNull()
  })
  it('never loads payout rates or offers a save to Coordinator', async () => {
    mocks.role = 'Coordinator'; await render(<AssignCrewModal {...props()} />)
    expect(mocks.roster).not.toHaveBeenCalled(); expect(host.querySelector('form')).toBeNull()
  })
})
describe('booking crew readback', () => {
  it('renders saved crew and re-reads after an assignment', async () => {
    mocks.list.mockResolvedValue([{ id: 'a', crewId: 'c', name: 'Mina Rai', role: 'Audio', callTime: null, wrapTime: null, days: 2, dailyRate: 2500, lineTotal: 5000 }])
    await render(<BookingCrewList bookingId="booking-uuid" includeMoney={false} version={0} />)
    expect(host.textContent).toContain('Mina Rai'); expect(host.textContent).not.toContain('2500'); expect(host.textContent).not.toContain('Daily rate')
    expect(mocks.list).toHaveBeenCalledWith('booking-uuid', false)
    await render(<BookingCrewList bookingId="booking-uuid" includeMoney={false} version={1} />)
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
  it('distinguishes a failed read from no assigned crew', async () => {
    mocks.list.mockRejectedValue(new Error('Read failed'))
    await render(<BookingCrewList bookingId="booking-uuid" includeMoney version={0} />)
    expect(host.textContent).toContain('Read failed'); expect(host.textContent).not.toContain('No crew assigned')
  })
})
