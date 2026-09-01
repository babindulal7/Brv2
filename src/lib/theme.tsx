import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

interface ThemeCtx {
  mode: ThemeMode
  theme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({
  mode: 'system',
  theme: 'light',
  setMode: () => {},
  toggle: () => {},
})

const KEY = 'br-theme-mode'

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function ThemeProvider({ children, initial = 'light' }: { children: ReactNode; initial?: ResolvedTheme }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    /*
     * DESIGN_DIRECTION_SPEC_v4.2 §2 — DEFAULT THEME = LIGHT.
     * Supersedes the 24 Aug dark-first ruling. Both themes stay; per-user toggle persists.
     */
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem(KEY) as ThemeMode
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'light'
  })

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    const sys = getSystemTheme()
    return sys || initial
  })

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  const theme: ResolvedTheme = mode === 'system' ? systemTheme : mode

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    localStorage.setItem(KEY, mode)
  }, [mode, theme])

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode)
  }

  const toggle = () => {
    setModeState((m) => {
      const current = m === 'system' ? systemTheme : m
      return current === 'light' ? 'dark' : 'light'
    })
  }

  return (
    <Ctx.Provider value={{ mode, theme, setMode, toggle }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)

