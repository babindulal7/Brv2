import { useCallback, useEffect, useState } from 'react'
import { readSettings, languageCodeOf } from '../../lib/settingsStore'
import { hydrateSharedSettings } from '../../lib/settingsSync'
import type { SettingsRecord } from '../../lib/settingsStore'
import { applyLanguage } from '../../lib/i18n'

/**
 * **The settings load — §11.1: *"A settings page must show a loading state —
 * stale settings are wrong settings."***
 *
 * The page used to read the store in a `useState` initialiser and render
 * immediately. That is not a loading state; it is the absence of one, and it
 * quietly assumes the read cannot fail. Two things make it a real boundary:
 *
 *  1. **`readSettings()` can throw.** It touches `window.localStorage`, which
 *     raises `SecurityError` outright when storage is disabled or blocked by a
 *     third-party-cookie policy, and can raise on a corrupt profile. A page
 *     that assumes it succeeded renders the *defaults* while the operator
 *     believes they are looking at their own VAT rate — which is exactly the
 *     "stale settings are wrong settings" failure, in its worst form: silent.
 *  2. **`applyLanguage()` is genuinely asynchronous.** A Nepali session has to
 *     have its catalogue and faces applied before the page paints, or the first
 *     frame is in the wrong language.
 *
 * So the states are three and they are distinct: `loading` renders a skeleton
 * that says what it is waiting for, `error` renders what failed and offers a
 * retry, `ready` renders the page. No timer is involved anywhere — a fake delay
 * would be a fake loading state, which is worse than none.
 */

export type SettingsLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; settings: SettingsRecord }

export interface SettingsLoadResult {
  load: SettingsLoad
  /** Re-runs the read. Bound to the error state's Retry. */
  reload: () => void
  /** Applies a saved patch to the loaded record without a second read. */
  patch: (p: Partial<SettingsRecord>) => void
}

export function useSettingsLoad(): SettingsLoadResult {
  const [load, setLoad] = useState<SettingsLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })

    void (async () => {
      try {
        /* Best-effort: offline, the screen shows the last values this device had. */
        await hydrateSharedSettings().catch(() => undefined)
        const settings = readSettings()
        /* The stored language is applied before the page is declared ready, so
           a Nepali session never paints an English first frame. */
        await applyLanguage(languageCodeOf(settings.language))
        if (live) setLoad({ status: 'ready', settings })
      } catch (e) {
        if (!live) return
        setLoad({
          status: 'error',
          message:
            e instanceof Error && e.message
              ? e.message
              : 'This browser refused access to its local storage, so the saved settings could not be read.',
        })
      }
    })()

    return () => {
      live = false
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((a) => a + 1), [])

  const patch = useCallback((p: Partial<SettingsRecord>) => {
    setLoad((l) => (l.status === 'ready' ? { status: 'ready', settings: { ...l.settings, ...p } } : l))
  }, [])

  return { load, reload, patch }
}
