// @vitest-environment jsdom
/* RULING 2026-10-13: the Glass theme is mode 'glass' → data-theme 'dark' +
   data-style 'glass'. These pin the three things that would break silently:
   it resolves to dark, it clears when leaving, and it survives a reload. */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, useTheme } from '../theme'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  let api: ReturnType<typeof useTheme> | null = null
  function Probe() {
    api = useTheme()
    return null
  }
  const el = document.createElement('div')
  const root = createRoot(el)
  act(() => root.render(<ThemeProvider><Probe /></ThemeProvider>))
  return { get: () => api!, unmount: () => act(() => root.unmount()) }
}

const html = document.documentElement

describe('Glass theme', () => {
  beforeEach(() => {
    localStorage.clear()
    delete html.dataset['style']
    html.dataset['theme'] = 'light'
  })

  it('resolves to dark and stamps data-style="glass"', () => {
    const t = mount()
    act(() => t.get().setMode('glass'))
    expect(t.get().mode).toBe('glass')
    expect(t.get().theme).toBe('dark')
    expect(html.dataset['theme']).toBe('dark')
    expect(html.dataset['style']).toBe('glass')
    t.unmount()
  })

  it('clears data-style when switching to light or dark', () => {
    const t = mount()
    act(() => t.get().setMode('glass'))
    act(() => t.get().setMode('light'))
    expect(html.dataset['theme']).toBe('light')
    expect(html.dataset['style']).toBeUndefined()
    act(() => t.get().setMode('glass'))
    act(() => t.get().setMode('dark'))
    expect(html.dataset['theme']).toBe('dark')
    expect(html.dataset['style']).toBeUndefined()
    t.unmount()
  })

  it('is remembered across a reload', () => {
    const a = mount()
    act(() => a.get().setMode('glass'))
    a.unmount()
    delete html.dataset['style']
    const b = mount()
    expect(b.get().mode).toBe('glass')
    expect(html.dataset['style']).toBe('glass')
    b.unmount()
  })
})

/* RULING 2026-10-13: Glass is a finish on either base. The pickers call
   choose(); these pin the rules the three buttons rely on. */
describe('Glass finish on Light (frosted)', () => {
  beforeEach(() => {
    localStorage.clear()
    delete html.dataset['style']
    html.dataset['theme'] = 'light'
  })

  it('Glass from Light is frosted: resolves light and stamps data-style="glass"', () => {
    const t = mount()
    act(() => t.get().choose('glass'))
    expect(t.get().mode).toBe('glass-light')
    expect(t.get().theme).toBe('light')
    expect(t.get().glass).toBe(true)
    expect(html.dataset['theme']).toBe('light')
    expect(html.dataset['style']).toBe('glass')
    t.unmount()
  })

  it('Light and Dark keep the finish; Glass turns it off on the current base', () => {
    const t = mount()
    act(() => t.get().choose('glass'))
    act(() => t.get().choose('dark'))
    expect(t.get().mode).toBe('glass') // Obsidian — the stored value it always had
    expect(html.dataset['theme']).toBe('dark')
    act(() => t.get().choose('light'))
    expect(t.get().mode).toBe('glass-light')
    act(() => t.get().choose('glass'))
    expect(t.get().mode).toBe('light')
    expect(t.get().glass).toBe(false)
    expect(html.dataset['style']).toBeUndefined()
    act(() => t.get().choose('dark'))
    act(() => t.get().choose('glass'))
    expect(t.get().mode).toBe('glass')
    act(() => t.get().choose('glass'))
    expect(t.get().mode).toBe('dark')
    t.unmount()
  })

  it('frosted is remembered across a reload', () => {
    const a = mount()
    act(() => a.get().setMode('glass-light'))
    a.unmount()
    delete html.dataset['style']
    html.dataset['theme'] = 'dark'
    const b = mount()
    expect(b.get().mode).toBe('glass-light')
    expect(html.dataset['theme']).toBe('light')
    expect(html.dataset['style']).toBe('glass')
    b.unmount()
  })

  it('the command-palette toggle treats frosted as light (→ dark)', () => {
    const t = mount()
    act(() => t.get().setMode('glass-light'))
    act(() => t.get().toggle())
    expect(t.get().mode).toBe('dark')
    t.unmount()
  })
})
