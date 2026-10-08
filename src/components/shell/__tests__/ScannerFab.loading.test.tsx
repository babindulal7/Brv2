// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import ScannerFab, { toggleScanner } from '../ScannerFab'

const camera = vi.hoisted(() => ({
  imported: vi.fn(),
  decode: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('@zxing/browser', () => {
  camera.imported()
  return { BrowserMultiFormatReader: class { decodeFromVideoDevice = camera.decode } }
})
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/supabase', () => ({ supabase: {} }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

it('defers camera code until opening and stops a camera that resolves after closing', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let resolveCamera!: (controls: { stop: () => void }) => void
  camera.decode.mockImplementation(() => new Promise(resolve => { resolveCamera = resolve }))
  try {
    await act(async () => { root.render(<ScannerFab />) })
    expect(camera.imported).not.toHaveBeenCalled()
    await act(async () => { toggleScanner() })
    await vi.waitFor(() => expect(camera.decode).toHaveBeenCalledOnce())
    await act(async () => { toggleScanner() })
    await act(async () => { resolveCamera({ stop: camera.stop }) })
    expect(camera.stop).toHaveBeenCalledOnce()
  } finally {
    await act(async () => { root.unmount() })
    host.remove()
  }
})
