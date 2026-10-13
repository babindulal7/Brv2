import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { readLocal, writeLocal, onMediaChange } from './safeStorage'

/* RULING 2026-10-13: 'glass' = the Obsidian Glass hybrid (dark theme + glass
   style layer). Resolves to 'dark' so every `theme === 'dark'` branch keeps
   working; the look lives only in theme.css under [data-style='glass'].
   Revert = remove 'glass' here and the [data-style='glass'] blocks in theme.css.
   RULING 2026-10-13: 'glass-light' = the same glass finish on the light theme
   (frosted). Resolves to 'light'. Revert = remove 'glass-light' here, in
   index.html, and the [data-theme='light'][data-style='glass'] blocks. */
export type ThemeMode = 'system' | 'dark' | 'light' | 'high-contrast' | 'glass' | 'glass-light'
export type ResolvedTheme = 'dark' | 'light' | 'high-contrast'
/* RULING 2026-10-13: the three buttons every theme picker shows. Light and Dark
   pick the base and KEEP the glass finish; Glass turns the finish on or off on
   the current base. So Light + Glass = frosted, Dark + Glass = Obsidian. */
export type ThemeChoice = 'light' | 'dark' | 'glass'

interface ThemeCtx {
  mode: ThemeMode
  theme: ResolvedTheme
  /** The glass finish is on (either base). */
  glass: boolean
  setMode: (mode: ThemeMode) => void
  choose: (choice: ThemeChoice) => void
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({
  mode: 'system',
  theme: 'light',
  glass: false,
  setMode: () => {},
  choose: () => {},
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
    return saved === 'dark' || saved === 'light' || saved === 'high-contrast' || saved === 'glass' || saved === 'glass-light' || saved === 'system' ? saved : 'light'
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

  const glass = mode === 'glass' || mode === 'glass-light'
  const theme: ResolvedTheme =
    mode === 'system' ? systemTheme : mode === 'glass' ? 'dark' : mode === 'glass-light' ? 'light' : mode

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    if (glass) document.documentElement.dataset['style'] = 'glass'
    else delete document.documentElement.dataset['style']
    /* A device that cannot remember the theme still gets the theme. */
    writeLocal(KEY, mode)
  }, [mode, theme, glass])

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode)
  }

  const choose = (choice: ThemeChoice) => {
    if (choice === 'glass') {
      setModeState(glass ? (theme === 'light' ? 'light' : 'dark') : theme === 'light' ? 'glass-light' : 'glass')
    } else if (choice === 'light') {
      setModeState(glass ? 'glass-light' : 'light')
    } else {
      setModeState(glass ? 'glass' : 'dark')
    }
  }

  const toggle = () => {
    setModeState((m) => {
      const current = m === 'system' ? systemTheme : m
      if (current === 'light' || current === 'glass-light') return 'dark'
      if (current === 'dark') return 'glass'
      if (current === 'glass') return 'high-contrast'
      return 'light'
    })
  }

  return (
    <Ctx.Provider value={{ mode, theme, glass, setMode, choose, toggle }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)

