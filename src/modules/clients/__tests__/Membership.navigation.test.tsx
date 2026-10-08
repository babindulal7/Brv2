// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemberListRow } from '../../../lib/queries/membership'
import Membership from '../Membership'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const members: MemberListRow[] = Array.from({ length: 11 }, (_, index) => ({
  id: `membership-${index}`,
  clientId: `client-${index}`,
  name: `Member ${String(index).padStart(2, '0')}`,
  kind: 'Individual',
  level: 'Creator',
  joinedIso: '2026-02-10',
  joinedAd: '10 Feb 2026',
  joinedBs: '2082-10-28 BS',
  feePaidPaisa: null,
}))

vi.mock('../../../lib/queries/membership', () => ({ listMembers: vi.fn(async () => members) }))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => false }))

let currentSearch = ''
function LocationProbe() {
  currentSearch = useLocation().search
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Go back</button>
}

let root: Root | undefined
let host: HTMLDivElement | undefined
async function mount(entry: string) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={[entry]}><Membership embedded /><LocationProbe /></MemoryRouter>)
  })
  await act(async () => { await Promise.resolve() })
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  currentSearch = ''
})

describe('Membership directory URL state', () => {
  it('restores a client-type filter and page after refresh', async () => {
    await mount('/clients?tab=membership&mk=Individual&mp=2')
    expect(host?.textContent).toContain('Member 10')
    expect(host?.textContent).not.toContain('Member 00')
    expect(currentSearch).toContain('mk=Individual')
    expect(currentSearch).toContain('mp=2')
  })

  it('stores the next page in the URL', async () => {
    await mount('/clients?tab=membership')
    const next = host?.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')
    expect(next).not.toBeNull()
    await act(async () => { next?.click() })
    expect(currentSearch).toContain('mp=2')
    expect(host?.textContent).toContain('Member 10')
  })

  it('restores the previous plan after Back', async () => {
    await mount('/clients?tab=membership')
    const creator = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.startsWith('Creator '))
    expect(creator).toBeDefined()
    await act(async () => { creator?.click() })
    expect(currentSearch).toContain('ml=Creator')
    const back = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Go back')
    await act(async () => { back?.click() })
    expect(currentSearch).toBe('?tab=membership')
  })
})
