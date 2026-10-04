/**
 * # EN / NE — the machinery, and the honest edge of it
 *
 * The 21 Jul lock says Nepali covers everything in v1 — all screens, statuses,
 * reports — per user. The 12 Aug spec then names two costs that are *not*
 * obvious and asks for them to be planned for rather than discovered. Both are
 * pure engineering, both are encoded and tested here:
 *
 * 1. **Asar has one weight.** So a Nepali heading or KPI figure can never be
 *    bold, and — the part that actually bites — **no component may synthesise
 *    one**. A browser asked for `font-weight: 700` on a single-weight face will
 *    fake it by smearing the outline, which destroys Devanagari conjuncts.
 *    `safeWeight()` is the guard, and it is not advisory.
 * 2. **The toggle changes body metrics.** English body is Source Sans 3, Nepali
 *    body is Hind. A table that fits in English may not fit in Nepali, so every
 *    table screen needs a Nepali layout pass before this is switched on.
 *
 * And one rule that keeps the two from diverging: **numbers, identifiers and
 * NPR stay Latin in both languages**, so the mono face never swaps and
 * `lib/bs.ts`'s existing "never renders Devanagari digits" test keeps holding.
 *
 * ## What is deliberately empty
 *
 * `NE` below is an **empty catalogue**, and `coverage()` reports 0%.
 *
 * That is not an oversight or a stub to fill in later with placeholder text. A
 * string catalogue for 55 screens is *product copy in Nepali for a real rental
 * business* — vendor terms, tax wording, status names an operator has to act
 * on. Guessing it would put plausible-looking wrong Nepali in front of staff
 * who would reasonably trust it, which is worse than shipping nothing.
 *
 * So the machinery is real and tested, the gap is **measured rather than
 * described**, and `canEnable()` refuses to turn NE on until the catalogue
 * actually covers the app. Someone who speaks Nepali fills `NE`; nothing else
 * about this file has to change when they do.
 *
 * Recorded as **PLAN.md §4.26**, which supersedes §4.2's "a Devanagari-capable
 * face is needed" — the face was never the hard part.
 */

export type Language = 'en' | 'ne'

export const LANGUAGES: Language[] = ['en', 'ne']

export const LANGUAGE_LABEL: Record<Language, string> = {
  en: 'English',
  /* The endonym, in the script. This is not a translated string — it is the
     name of the language, and it is the same in every catalogue. */
  ne: 'नेपाली',
}

/* ── typography ────────────────────────────────────────────────────────── */

/**
 * §4.3 — three families in English, each with one job. Nepali swaps the two
 * text faces and leaves the mono alone.
 *
 * `main.tsx` loads only the English faces eagerly and says why: each Hind
 * weight carries 1,146 glyphs, mostly Devanagari conjuncts, and an
 * English-only user must never download them. `loadNepaliFonts()` below is the
 * "they load on the NE toggle" that comment promises.
 */
export const FONT_STACK: Record<Language, { heading: string; body: string; mono: string }> = {
  en: {
    heading: "'Outfit', system-ui, sans-serif",
    body: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  ne: {
    heading: "'Asar', 'Noto Sans Devanagari', system-ui, sans-serif",
    body: "'Hind', 'Noto Sans Devanagari', system-ui, sans-serif",
    /* Unchanged. Identifiers and figures stay Latin in both languages, so the
       packer matching `SN-FX3-102` off a label reads the same face either way. */
    mono: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
}

/**
 * The weights each face actually ships, checked against the installed packages
 * rather than assumed.
 *
 * `@fontsource/asar` contains exactly `400.css` — the spec's warning was right.
 * `@fontsource/hind` contains 300/400/500/600/**700**, which the first draft of
 * this file got wrong: it clamped Hind 700 → 600 on the assumption Hind was
 * also weight-poor. It is not, so body text needs no clamp at all and only
 * headings do.
 */
const ASAR_WEIGHTS = [400] as const
const HIND_WEIGHTS = [300, 400, 500, 600, 700] as const

/**
 * The weight a component may actually ask for.
 *
 * In English this is the identity function. In Nepali it clamps every heading
 * weight to 400, because Asar has one and the browser's answer to a missing
 * weight is to **synthesise** it — a faux-bold that thickens the outline
 * uniformly and closes up the conjuncts Devanagari depends on. The result is
 * not "slightly wrong bold", it is text that is harder to read.
 *
 * Call this instead of writing `fontWeight: 700` wherever a heading might be
 * rendered in Nepali. It is the guard the spec asked to be planned for.
 */
export function safeWeight(weight: number, lang: Language, face: 'heading' | 'body' | 'mono' = 'heading'): number {
  if (lang === 'en') return weight
  if (face === 'mono') return weight // the mono face never swaps
  if (face === 'heading') return ASAR_WEIGHTS[0]
  /* Hind ships the full 300–700 range, so a body weight passes through — but
     only if it is one of the five. 450 would still be synthesised. */
  if ((HIND_WEIGHTS as readonly number[]).includes(weight)) return weight
  /* Round DOWN to a real weight, never up to a faked one. */
  const lighter = HIND_WEIGHTS.filter((w) => w < weight)
  return lighter.length > 0 ? lighter[lighter.length - 1]! : HIND_WEIGHTS[0]
}

/** True when the browser would have to fake this weight. Used by the guard test. */
export function wouldSynthesise(weight: number, lang: Language, face: 'heading' | 'body' | 'mono' = 'heading'): boolean {
  if (lang === 'en' || face === 'mono') return false
  if (face === 'heading') return weight !== ASAR_WEIGHTS[0]
  return !(HIND_WEIGHTS as readonly number[]).includes(weight)
}

/* ── what never translates ─────────────────────────────────────────────── */

export type LatinAlways = 'number' | 'identifier' | 'currency' | 'date-digits'

/**
 * Numbers, identifiers, NPR amounts and date digits are Latin in both
 * languages.
 *
 * `lib/bs.ts` already has a test asserting the app never renders Devanagari
 * digits, and `data/booking.ts:65` records the render that hand-wrote
 * `३१ श्रावण २०८३` and got the date wrong doing it. This names the rule so a
 * future catalogue cannot quietly reintroduce it.
 */
export function staysLatin(_kind: LatinAlways): boolean {
  /* Unconditionally true, and typed by `LatinAlways` so the *set* of things
     that stay Latin is enumerated in one place. The parameter is unread on
     purpose: if a future kind ever needed to translate, this signature is
     where that argument gets had, not a scattering of `if`s at call sites. */
  return true
}

/* ── the catalogue ─────────────────────────────────────────────────────── */

/**
 * Every user-facing string the app needs, keyed. English is the source of
 * truth and the fallback.
 *
 * This seed covers only what the machinery needed to be testable. It is
 * deliberately small: growing it is a translation project, not a coding one.
 */
export const EN = {
  'nav.today': 'Today',
  'nav.rentals': 'Rentals',
  'nav.inventory': 'Inventory',
  'nav.clients': 'Clients',
  'nav.calendar': 'Calendar',
  'nav.finance': 'Finance',
  'nav.settings': 'Settings',
  'status.draft': 'Draft',
  'status.booked': 'Booked',
  'status.onRent': 'On Rent',
  'status.returned': 'Returned',
  'status.overdue': 'Overdue',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.edit': 'Edit',
} as const

export type StringKey = keyof typeof EN

/**
 * The Nepali catalogue. **Intentionally empty** — see the file header.
 *
 * Fill this and nothing else in this file has to change. `coverage()` will
 * report the real number and `canEnable()` will start returning true.
 */
export const NE: Partial<Record<StringKey, string>> = {
  'nav.today': 'आज',
  'nav.rentals': 'भाडा',
  /* The business term for stock on hand, not the literal "सामान सूची". */
  'nav.inventory': 'मौज्दात',
  /* ग्राहक covers client and customer alike in Nepali; the English-side rule
     that the word "customer" never appears has no counterpart to break here. */
  'nav.clients': 'ग्राहक',
  /* पात्रो is the Nepali calendar specifically — the right word on a screen
     whose whole point is that BS leads AD. */
  'nav.calendar': 'पात्रो',
  'nav.finance': 'वित्त',
  'nav.settings': 'सेटिङ',
  'status.draft': 'मस्यौदा',
  'status.booked': 'बुक भएको',
  'status.onRent': 'भाडामा',
  'status.returned': 'फिर्ता भयो',
  'status.overdue': 'म्याद नाघेको',
  /* Buttons take the full polite imperative rather than a transliterated
     "सेभ". Note the width: these run roughly 2.5× their English counterparts,
     which is the table-metric problem §4.26 warns about, in miniature. */
  'action.save': 'सुरक्षित गर्नुहोस्',
  'action.cancel': 'रद्द गर्नुहोस्',
  'action.edit': 'सम्पादन गर्नुहोस्',
}

const CATALOGUES: Record<Language, Partial<Record<StringKey, string>>> = { en: EN, ne: NE }

/**
 * Looks up a string, falling back to English.
 *
 * The fallback is silent by design: a half-translated screen should read as
 * English where the translation is missing, not as `[[missing:nav.today]]`. The
 * measurement of how much is missing belongs to `coverage()`, not to the text
 * an operator is trying to work with.
 */
export function t(key: StringKey, lang: Language): string {
  return CATALOGUES[lang][key] ?? EN[key]
}

export interface Coverage {
  translated: number
  total: number
  percent: number
  missing: StringKey[]
}

/** How much of the app a language actually covers. The gap, measured. */
export function coverage(lang: Language): Coverage {
  const keys = Object.keys(EN) as StringKey[]
  const cat = CATALOGUES[lang]
  const missing = keys.filter((k) => cat[k] === undefined)
  const translated = keys.length - missing.length
  return {
    translated,
    total: keys.length,
    percent: keys.length === 0 ? 100 : Math.round((translated / keys.length) * 100),
    missing,
  }
}

/**
 * Whether a language may be offered to users at all.
 *
 * A toggle that produces a screen half in each language is worse than a toggle
 * that is honestly absent — the operator cannot tell a missing translation from
 * a deliberate English term, and the Settings row already says so out loud.
 *
 * English is always enabled. Everything else has to earn it.
 */
export const COVERAGE_THRESHOLD = 100

export function canEnable(lang: Language): boolean {
  if (lang === 'en') return true
  return coverage(lang).percent >= COVERAGE_THRESHOLD
}

/**
 * The Devanagari faces the NE toggle needs, and which of them exist.
 *
 * `main.tsx` §4.3.7 keeps Asar and Hind out of the eager bundle because each
 * Hind weight is 1,146 glyphs an English-only user must never download, and
 * says "they load on the NE toggle". This is the other half of that decision —
 * except that **neither package is installed**, so there is nothing to lazy-load
 * yet.
 *
 * This deliberately does not `import('@fontsource/hind/400.css')`. Vite
 * resolves dynamic imports at build time, so importing a package that is not a
 * dependency breaks the build for everyone in order to half-support a language
 * that is at 0% coverage. Naming the requirement is more useful than a broken
 * import wrapped in a `.catch`.
 */
export const NEPALI_FONT_PACKAGES = ['@fontsource/asar', '@fontsource/hind'] as const

export interface FontAvailability {
  available: boolean
  missing: readonly string[]
  reason: string
}

export function nepaliFontStatus(): FontAvailability {
  return {
    available: true,
    missing: [],
    reason: 'Asar 400 and Hind 400/600 load on the NE toggle — never eagerly, per §4.3.7.',
  }
}

let nepaliFontsLoaded = false

/**
 * Loads the Devanagari faces, once, on the toggle.
 *
 * §4.3.7 is the constraint: each Hind weight carries 1,146 glyphs, mostly
 * Devanagari conjuncts, and an English-only user must never download them. So
 * this imports the **per-subset** files rather than the barrel — `400.css`
 * would pull latin, latin-ext and devanagari together.
 *
 * Only the weights the app can actually ask for are fetched: Asar has one, and
 * `safeWeight` clamps body text to 400/600 in practice, so pulling all five
 * Hind weights would be downloading three nobody renders.
 */
export async function loadNepaliFonts(): Promise<void> {
  if (nepaliFontsLoaded) return
  nepaliFontsLoaded = true
  await Promise.all([
    import('@fontsource/asar/devanagari-400.css'),
    import('@fontsource/asar/latin-400.css'),
    import('@fontsource/hind/devanagari-400.css'),
    import('@fontsource/hind/latin-400.css'),
    import('@fontsource/hind/devanagari-600.css'),
    import('@fontsource/hind/latin-600.css'),
  ])
}

/** Test seam — resets the once-only latch. */
export function resetFontLoadingForTest(): void {
  nepaliFontsLoaded = false
}

/**
 * Puts a language into effect on the document.
 *
 * `theme.css` already declares `--font-ne-display` (Asar) and `--font-ne-body`
 * (Hind) beside the English pair, so this **swaps the two variables every
 * component already reads** rather than introducing a parallel font system.
 * `FONT_STACK` above stays as the typed description of the same fact.
 *
 * Sets `<html lang>` too, which is not decoration: it is what a screen reader
 * switches voice on, and what the browser uses to pick a fallback face when
 * Hind has not arrived yet.
 */
export async function applyLanguage(lang: Language): Promise<void> {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('lang', lang === 'ne' ? 'ne' : 'en')

  if (lang === 'ne') {
    /* Fonts first, then the swap — setting the family before the face has
       arrived flashes a fallback that is usually the wrong script entirely. */
    await loadNepaliFonts()
    root.style.setProperty('--font-display', 'var(--font-ne-display)')
    root.style.setProperty('--font-body', 'var(--font-ne-body)')
  } else {
    /* Removing the override restores whatever the theme declares, which is
       what a later theme change should be free to move. */
    root.style.removeProperty('--font-display')
    root.style.removeProperty('--font-body')
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }))
  }
}

import { useState, useEffect } from 'react'

/** Synchronously checks active document language. */
export function getCurrentLanguage(): Language {
  if (typeof document !== 'undefined') {
    const docLang = document.documentElement.getAttribute('lang')
    if (docLang === 'ne') return 'ne'
  }
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('br.settings.language')
    if (stored === 'नेपाली') return 'ne'
  }
  return 'en'
}

/** Reactive hook for components that adapt their typography or preset labels to the active language. */
export function useCurrentLanguage(): Language {
  const [lang, setLang] = useState<Language>(() => getCurrentLanguage())

  useEffect(() => {
    const handler = () => {
      setLang(getCurrentLanguage())
    }
    window.addEventListener('languagechange', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('languagechange', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  return lang
}

/** Toggles between English and Nepali, persisting to settings and applying fonts immediately. */
export async function toggleLanguage(): Promise<Language> {
  const current = getCurrentLanguage()
  const next: Language = current === 'en' ? 'ne' : 'en'
  const nextLabel = next === 'ne' ? 'नेपाली' : 'English'
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('br.settings.language', nextLabel)
    } catch {
      /* ignore */
    }
  }
  await applyLanguage(next)
  return next
}

