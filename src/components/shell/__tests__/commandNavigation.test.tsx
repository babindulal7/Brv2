// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemRole } from '../../../types/database'
import { CommandPalette, openCommandPalette } from '../CommandPalette'

const user = { role: 'Owner' as SystemRole }
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('../../../lib/theme', () => ({ useTheme: () => ({ theme: 'light', toggle: vi.fn() }) }))
vi.mock('../ScannerFab', () => ({ toggleScanner: vi.fn() }))
vi.mock('../../../lib/queries/globalSearch', () => ({ searchRecords: vi.fn().mockResolvedValue([]) }))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root

async function mount(as: SystemRole) {
  user.role = as
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<MemoryRouter><CommandPalette /></MemoryRouter>))
  await act(async () => openCommandPalette())
}
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('command navigation', () => {
  it('includes More destinations for staff', async () => {
    await mount('Owner')
    expect(host.textContent).toContain('Crew Assist')
    expect(host.textContent).toContain('Tools')
    expect(host.textContent).toContain('Settings')
  })
  it('continues filtering money and staff destinations for external clients', async () => {
    await mount('Client')
    expect(host.textContent).not.toContain('Finance')
    expect(host.textContent).not.toContain('Crew Assist')
    expect(host.textContent).toContain('Inventory')
  })
})
