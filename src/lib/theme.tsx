import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { readLocal, writeLocal, onMediaChange } from './safeStorage'

export type ThemeMode = 'system' | 'dark' | 'light' | 'high-contrast'
export type ResolvedTheme = 'dark' | 'light' | 'high-contrast'

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
    /* `readLocal`, not `localStorage.getItem` — this runs inside ThemeProvider's
       useState initializer, which is ABOVE every ErrorBoundary in the tree, and
       WebKit throws SecurityError on the property access under Lockdown Mode or
       "Block All Cookies". Unguarded, a preference lookup blanked the whole app
       on Apple devices. See `safeStorage.ts`. */
    const saved = readLocal(KEY) as ThemeMode | null
    return saved === 'dark' || saved === 'light' || saved === 'high-contrast' || saved === 'system' ? saved : 'light'
  })

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    const sys = getSystemTheme()
    return sys || initial
  })

  useEffect(() => {
    /* `MediaQueryList.addEventListener` is Safari 14+; 13 and earlier have only
       `addListener`, and calling the modern one there throws — in a mount
       effect above every ErrorBoundary, which is a blank page on an older iPad
       rather than a theme that fails to follow the system. */
    return onMediaChange('(prefers-color-scheme: dark)', (matches) =>
      setSystemTheme(matches ? 'dark' : 'light'),
    )
  }, [])

  const theme: ResolvedTheme = mode === 'system' ? systemTheme : mode

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    /* A device that cannot remember the theme still gets the theme. */
    writeLocal(KEY, mode)
  }, [mode, theme])

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode)
  }

  const toggle = () => {
    setModeState((m) => {
      const current = m === 'system' ? systemTheme : m
      if (current === 'light') return 'dark'
      if (current === 'dark') return 'high-contrast'
      return 'light'
    })
  }

  return (
    <Ctx.Provider value={{ mode, theme, setMode, toggle }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)

